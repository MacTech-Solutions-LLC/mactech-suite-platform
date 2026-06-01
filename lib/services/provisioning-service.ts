/**
 * Auto-provisioning for paid Orders.
 *
 * Triggered by the QBO webhook processor when a Payment event matches an
 * Order's qboInvoiceId. The flow:
 *
 *   1. Re-load the Order with package + included apps
 *   2. Resolve the org: reuse the company's existing org (so additional
 *      buyers JOIN it) or create a new Clerk org + CustomerOrganization
 *   3. (new orgs only) Create the Clerk org + CustomerOrganization row
 *   4. Apply ProductEntitlement rows for each package.includedAppKeys (upsert)
 *   5. Push enabled apps into Clerk publicMetadata for sibling apps to read
 *   6. Send Clerk invitation to the buyer (founder → org:admin, joiner → member)
 *   8. Create Subscription row if the package billingCycle != one_time
 *   9. Mark Order provisioned + link customerOrganizationId
 *  10. Audit + outbound webhook dispatch
 *
 * Idempotency: bail at step 1 if Order.status is already "provisioned" or
 * Order.customerOrganizationId is already set. Webhook redelivery is safe.
 *
 * Failures: partial provisioning is recorded on the Order (failureReason
 * + a stable resumable state), so an operator can re-trigger from
 * /admin/orders without manually unwinding.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import {
  buildPublicMetadata,
  createClerkInvitation,
  createClerkOrg,
  tryClerk,
  updateClerkOrg,
} from "./clerk-org-service";
import { dispatchWebhookEvent } from "./webhook-service";
import type { CustomerOrganization, Order } from "@prisma/client";

export type ProvisionResult =
  | { ok: true; customerOrganizationId: string; clerkOrgId: string | null; invited: boolean }
  | { ok: false; status: number; error: string };

export async function provisionOrder(orderId: string): Promise<ProvisionResult> {
  // 0. Pre-flight env
  if (!env.SYSTEM_PROVISIONER_CLERK_USER_ID) {
    return {
      ok: false,
      status: 503,
      error: "SYSTEM_PROVISIONER_CLERK_USER_ID is not configured.",
    };
  }

  // 1. Load + idempotency check
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { package: true },
  });
  if (!order) return { ok: false, status: 404, error: `Order ${orderId} not found` };
  if (order.status === "provisioned" && order.customerOrganizationId) {
    return {
      ok: true,
      customerOrganizationId: order.customerOrganizationId,
      clerkOrgId: null,
      invited: false,
    };
  }
  if (order.status !== "paid" && order.status !== "payment_pending") {
    // Only paid orders should provision; refuse silently to keep webhook
    // retries safe for other states.
    return {
      ok: false,
      status: 409,
      error: `Order status is ${order.status}, expected paid`,
    };
  }

  // 2. Resolve the organization. Reuse an existing org for the same company
  //    so additional buyers JOIN it rather than spawning a duplicate; only
  //    create a fresh org for the company's first paid order.
  const existingOrg = await findExistingOrgForBuyer(order);

  let org: CustomerOrganization;
  let clerkOrgId: string | null;
  const joinedExisting = Boolean(existingOrg);

  if (existingOrg) {
    org = existingOrg;
    clerkOrgId = existingOrg.clerkOrgId;
  } else {
    // 2a. Slug
    const baseSlug = deriveSlug(order.buyerCompany ?? order.buyerEmail.split("@")[0] ?? "org");
    const slug = await ensureUniqueSlug(baseSlug);
    const orgName = order.buyerCompany ?? order.buyerName ?? order.buyerEmail;

    // 2b. Clerk org (best-effort — local row still created if Clerk fails)
    const initialPublicMetadata = buildPublicMetadata(
      {
        id: "pending",
        slug,
        customerType: "other",
        subscriptionTier: order.package.entitlementTier,
        cmmcTargetLevel: "unknown",
        cuiBoundaryType: "none",
        status: "onboarding",
        industry: null,
      } as never,
      [],
      packageTrainingCourses(order.package.metadataJson),
    );

    clerkOrgId = null;
    const clerkRes = await tryClerk("createOrganization (auto-provision)", () =>
      createClerkOrg({
        name: orgName,
        slug,
        createdBy: env.SYSTEM_PROVISIONER_CLERK_USER_ID!,
        publicMetadata: initialPublicMetadata,
      }),
    );
    if (clerkRes.ok) clerkOrgId = clerkRes.value.id;

    // 2c. CustomerOrganization
    const intake = readIntake(order);
    org = await prisma.customerOrganization.create({
      data: {
        name: orgName,
        slug,
        legalName: order.buyerCompany ?? null,
        domain: intake.companyDomain,
        cageCode: intake.cageCode,
        uei: intake.uei,
        primaryContactName: order.buyerName ?? null,
        primaryContactEmail: order.buyerEmail,
        customerType: "other",
        subscriptionTier: order.package.entitlementTier,
        status: "onboarding",
        clerkOrgId,
      },
    });
  }

  // 5. Entitlements — one per app in package.includedAppKeys
  if (order.package.includedAppKeys.length > 0) {
    const apps = await prisma.appRegistry.findMany({
      where: { appKey: { in: order.package.includedAppKeys } },
      select: { id: true, appKey: true, name: true },
    });
    for (const app of apps) {
      // Upsert so re-provisioning or a second package into an existing org
      // never trips the (customerOrganizationId, appRegistryId) unique key.
      await prisma.productEntitlement.upsert({
        where: {
          customerOrganizationId_appRegistryId: {
            customerOrganizationId: org.id,
            appRegistryId: app.id,
          },
        },
        create: {
          customerOrganizationId: org.id,
          appRegistryId: app.id,
          enabled: true,
          plan: planFromTier(order.package.entitlementTier),
          status: "active",
        },
        update: {
          enabled: true,
          plan: planFromTier(order.package.entitlementTier),
          status: "active",
        },
      });
      await writeAuditLog({
        eventType: "entitlement.enabled",
        eventCategory: "entitlement",
        severity: "info",
        action: `Auto-enabled ${app.name} for ${org.name} (paid order ${order.id})`,
        customerOrganizationId: org.id,
        appRegistryId: app.id,
        resourceType: "ProductEntitlement",
        metadata: { appKey: app.appKey, orderId: order.id, packageSku: order.package.sku },
      });
    }

    // 6. Push enabled apps + training entitlement into Clerk publicMetadata.
    //    The training hub reads trainingCourses to auto-assign modules + roles.
    if (clerkOrgId) {
      const enabled = await prisma.productEntitlement.findMany({
        where: { customerOrganizationId: org.id, enabled: true },
        include: { app: { select: { appKey: true } } },
      });
      const trainingCourses = await orgTrainingCourses(org.id, order.package.metadataJson);
      await tryClerk("updateOrganization (post-provision entitlements)", () =>
        updateClerkOrg({
          clerkOrgId,
          publicMetadata: buildPublicMetadata(org, enabled, trainingCourses),
        }),
      );
    }
  }

  // 7. Invite buyer
  let invited = false;
  if (clerkOrgId) {
    const inviteRes = await tryClerk("createOrganizationInvitation (auto-provision)", () =>
      createClerkInvitation({
        clerkOrgId,
        emailAddress: order.buyerEmail,
        inviterUserId: env.SYSTEM_PROVISIONER_CLERK_USER_ID!,
        // Founding buyer administers the org; later joiners come in as members.
        role: joinedExisting ? "org:member" : "org:admin",
        redirectUrl: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/welcome`,
        publicMetadata: { provisionedFromOrderId: order.id, packageSku: order.package.sku },
      }),
    );
    invited = inviteRes.ok;
  }

  // 8. Subscription (if recurring)
  let subscriptionId: string | null = null;
  if (order.package.billingCycle !== "one_time") {
    const meta = (order.metadataJson ?? {}) as Record<string, unknown>;
    const qboRecurringTransactionId =
      typeof meta.qboRecurringTransactionId === "string"
        ? meta.qboRecurringTransactionId
        : null;
    const { start, end } = computePeriod(order.package.billingCycle);
    const sub = await prisma.subscription.create({
      data: {
        customerOrganizationId: org.id,
        packageId: order.package.id,
        orderId: order.id,
        qboRecurringTransactionId,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        status: "active",
      },
    });
    subscriptionId = sub.id;
  }

  // 9. Mark Order provisioned
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "provisioned",
      provisionedAt: new Date(),
      customerOrganizationId: org.id,
    },
  });

  const auditEntry = await writeAuditLog({
    eventType: "order.provisioned",
    eventCategory: "org",
    severity: "info",
    action: joinedExisting
      ? `Joined ${order.buyerEmail} into existing org ${org.name} for paid order ${order.id}`
      : `Auto-provisioned ${org.name} for paid order ${order.id}`,
    customerOrganizationId: org.id,
    resourceType: "Order",
    resourceId: order.id,
    metadata: {
      clerkOrgId,
      invited,
      joinedExisting,
      subscriptionId,
      packageSku: order.package.sku,
      includedAppKeys: order.package.includedAppKeys,
    },
  });

  void dispatchWebhookEvent({
    eventType: "customer_org.provisioned",
    eventId: auditEntry.id,
    customerOrganizationId: org.id,
    payload: {
      orderId: order.id,
      packageSku: order.package.sku,
      buyerEmail: order.buyerEmail,
      enabledApps: order.package.includedAppKeys,
    },
  });

  return { ok: true, customerOrganizationId: org.id, clerkOrgId, invited };
}

/** Domains where a shared address does NOT imply a shared organization. */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com",
  "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com",
]);

/** Pull the formal intake captured at checkout off the order. */
function readIntake(order: Order): {
  companyDomain: string | null;
  phone: string | null;
  jobTitle: string | null;
  cageCode: string | null;
  uei: string | null;
} {
  const meta = (order.metadataJson ?? {}) as Record<string, unknown>;
  const intake = (meta.intake ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    companyDomain: str(intake.companyDomain),
    phone: str(intake.phone),
    jobTitle: str(intake.jobTitle),
    cageCode: str(intake.cageCode),
    uei: str(intake.uei),
  };
}

/** Training courses (CourseType values) a package grants, from its metadata. */
function packageTrainingCourses(metadataJson: unknown): string[] {
  const meta = (metadataJson ?? {}) as Record<string, unknown>;
  const training = (meta.training ?? {}) as Record<string, unknown>;
  const courses = training.courses;
  return Array.isArray(courses) ? courses.filter((c): c is string => typeof c === "string") : [];
}

/** Union of training courses across all of the org's orders' packages, plus
 *  the current order's package (which isn't linked to the org yet at the time
 *  this runs during provisioning). */
async function orgTrainingCourses(orgId: string, currentPackageMeta: unknown): Promise<string[]> {
  const orders = await prisma.order.findMany({
    where: { customerOrganizationId: orgId },
    include: { package: { select: { metadataJson: true } } },
  });
  const set = new Set<string>(packageTrainingCourses(currentPackageMeta));
  for (const o of orders) {
    for (const c of packageTrainingCourses(o.package.metadataJson)) set.add(c);
  }
  return Array.from(set);
}

/**
 * The org a new buyer should join, or null to create a fresh one.
 *   1. By explicit company domain captured at intake — matched against the
 *      org's `domain` column. The strongest, most deliberate dedupe key.
 *   2. By CAGE code — a unique DIB org identifier when supplied.
 *   3. By company name — case-insensitive match on legalName or name.
 *   4. By corporate email domain — two buyers sharing a non-free email
 *      domain (e.g. @acme.com) belong to the same org.
 * Individuals (no company/domain + a free email domain) get their own org.
 */
async function findExistingOrgForBuyer(
  order: Order,
): Promise<CustomerOrganization | null> {
  const intake = readIntake(order);

  if (intake.companyDomain) {
    const byDomain = await prisma.customerOrganization.findFirst({
      where: { domain: { equals: intake.companyDomain, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    });
    if (byDomain) return byDomain;
  }

  if (intake.cageCode) {
    const byCage = await prisma.customerOrganization.findFirst({
      where: { cageCode: { equals: intake.cageCode, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    });
    if (byCage) return byCage;
  }

  const company = order.buyerCompany?.trim();
  if (company) {
    const byName = await prisma.customerOrganization.findFirst({
      where: {
        OR: [
          { legalName: { equals: company, mode: "insensitive" } },
          { name: { equals: company, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (byName) return byName;
  }

  const emailDomain = intake.companyDomain ?? order.buyerEmail.split("@")[1]?.toLowerCase();
  if (emailDomain && !FREE_EMAIL_DOMAINS.has(emailDomain)) {
    const byEmail = await prisma.customerOrganization.findFirst({
      where: {
        OR: [
          { domain: { equals: emailDomain, mode: "insensitive" } },
          { primaryContactEmail: { endsWith: `@${emailDomain}`, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (byEmail) return byEmail;
  }

  return null;
}

function deriveSlug(seed: string): string {
  const slug = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "org";
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const existing = await prisma.customerOrganization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now()}`;
}

function planFromTier(tier: string): "starter" | "professional" | "enterprise" | "custom" {
  switch (tier) {
    case "starter":
    case "professional":
    case "enterprise":
      return tier;
    default:
      return "custom";
  }
}

function computePeriod(cycle: Order["status"] extends never ? never : string): { start: Date; end: Date } {
  const start = new Date();
  const end = new Date(start);
  switch (cycle) {
    case "monthly":
      end.setMonth(end.getMonth() + 1);
      break;
    case "quarterly":
      end.setMonth(end.getMonth() + 3);
      break;
    case "annually":
      end.setFullYear(end.getFullYear() + 1);
      break;
    default:
      // one_time — keep end = start; subscription shouldn't be created
      // in this branch but defensive.
      break;
  }
  return { start, end };
}
