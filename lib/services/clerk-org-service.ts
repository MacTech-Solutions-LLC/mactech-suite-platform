/**
 * Single point of contact for Clerk's organization API.
 *
 * Every mutation that needs to touch Clerk routes through this module so we
 * have one place to:
 *   - check `clerkConfigured()` and short-circuit cleanly when Clerk isn't set
 *   - normalize errors (Clerk throws verbose nested objects; we extract a
 *     single human-readable message)
 *   - centralize the publicMetadata schema we mirror from the local DB
 *
 * Functions return either the Clerk resource (on success) or throw a
 * `ClerkSyncError`. Callers are expected to either await + propagate (when
 * the Clerk side is the source of truth) or catch + log (when the local
 * write should still succeed even if Clerk is unreachable).
 */

import { clerkConfigured } from "@/lib/env";
import type {
  CustomerOrganization,
  ProductEntitlement,
} from "@prisma/client";

export class ClerkSyncError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ClerkSyncError";
  }
}

function explain(err: unknown): string {
  if (err instanceof ClerkSyncError) return err.message;
  if (err instanceof Error) {
    // Clerk SDK throws { errors: [{ longMessage }] }-shaped errors via .clerkError
    const anyErr = err as Error & { errors?: Array<{ longMessage?: string; message?: string }> };
    const first = anyErr.errors?.[0];
    if (first) return first.longMessage || first.message || err.message;
    return err.message;
  }
  return String(err);
}

async function clerk() {
  if (!clerkConfigured()) {
    throw new ClerkSyncError("Clerk is not configured on this environment.");
  }
  const { clerkClient } = await import("@clerk/nextjs/server");
  return clerkClient();
}

/**
 * The shape of metadata mirrored to Clerk's `publicMetadata`. Sibling apps
 * can read this directly via the Clerk SDK without hitting our API.
 *
 * Anything sensitive (private notes, internal IDs, raw audit) belongs in
 * `privateMetadata` instead.
 */
export interface OrgPublicMetadata {
  mactechCustomerOrgId: string;
  slug: string;
  customerType: string;
  subscriptionTier: string;
  cmmcTargetLevel: string;
  cuiBoundaryType: string;
  status: string;
  industry?: string | null;
  enabledApps: string[];
}

export function buildPublicMetadata(
  org: CustomerOrganization,
  enabledEntitlements: Array<{ enabled: boolean; app: { appKey: string } }>,
): OrgPublicMetadata {
  return {
    mactechCustomerOrgId: org.id,
    slug: org.slug,
    customerType: org.customerType,
    subscriptionTier: org.subscriptionTier,
    cmmcTargetLevel: org.cmmcTargetLevel,
    cuiBoundaryType: org.cuiBoundaryType,
    status: org.status,
    industry: org.industry,
    enabledApps: enabledEntitlements
      .filter((e) => e.enabled)
      .map((e) => e.app.appKey),
  };
}

export interface CreateClerkOrgInput {
  name: string;
  slug: string;
  createdBy: string;
  publicMetadata: OrgPublicMetadata;
  privateMetadata?: Record<string, unknown>;
  maxAllowedMemberships?: number | null;
}

/**
 * Create a Clerk organization. Throws ClerkSyncError on failure; the caller
 * decides whether that's fatal for the local write.
 *
 * We always omit the Clerk-side `slug` field here. Our local DB owns the
 * canonical slug (`CustomerOrganization.slug`) and uses it for routing;
 * Clerk's slug only matters for their hosted Account Portal URLs which we
 * don't expose. Some Clerk instances also have organization slugs disabled
 * outright, in which case passing one is a hard error. Easier to never
 * pass it and stay forward-compatible across instance configurations.
 */
export async function createClerkOrg(
  input: CreateClerkOrgInput,
): Promise<{ id: string; slug: string }> {
  const client = await clerk();
  try {
    const org = await client.organizations.createOrganization({
      name: input.name,
      createdBy: input.createdBy,
      publicMetadata: input.publicMetadata as unknown as Record<string, unknown>,
      privateMetadata: input.privateMetadata,
      maxAllowedMemberships: input.maxAllowedMemberships ?? undefined,
    });
    return { id: org.id, slug: org.slug ?? input.slug };
  } catch (err) {
    throw new ClerkSyncError(`Clerk createOrganization failed: ${explain(err)}`, err);
  }
}

export interface UpdateClerkOrgInput {
  clerkOrgId: string;
  name?: string;
  slug?: string;
  publicMetadata?: OrgPublicMetadata;
  privateMetadata?: Record<string, unknown>;
  maxAllowedMemberships?: number | null;
}

export async function updateClerkOrg(input: UpdateClerkOrgInput): Promise<void> {
  const client = await clerk();
  try {
    await client.organizations.updateOrganization(input.clerkOrgId, {
      name: input.name,
      // Slug intentionally omitted — see createClerkOrg comment for why.
      // Local CustomerOrganization.slug remains the source of truth.
      publicMetadata:
        (input.publicMetadata as unknown as Record<string, unknown>) ?? undefined,
      privateMetadata: input.privateMetadata,
      maxAllowedMemberships:
        input.maxAllowedMemberships === null
          ? 0 // 0 disables the cap in Clerk's API
          : input.maxAllowedMemberships ?? undefined,
    });
  } catch (err) {
    throw new ClerkSyncError(`Clerk updateOrganization failed: ${explain(err)}`, err);
  }
}

export async function deleteClerkOrg(clerkOrgId: string): Promise<void> {
  const client = await clerk();
  try {
    await client.organizations.deleteOrganization(clerkOrgId);
  } catch (err) {
    throw new ClerkSyncError(`Clerk deleteOrganization failed: ${explain(err)}`, err);
  }
}

export interface CreateClerkInvitationInput {
  clerkOrgId: string;
  emailAddress: string;
  inviterUserId: string;
  role: "org:admin" | "org:member";
  redirectUrl: string;
  publicMetadata?: Record<string, unknown>;
}

export async function createClerkInvitation(
  input: CreateClerkInvitationInput,
): Promise<{ id: string }> {
  const client = await clerk();
  try {
    const inv = await client.organizations.createOrganizationInvitation({
      organizationId: input.clerkOrgId,
      emailAddress: input.emailAddress,
      inviterUserId: input.inviterUserId,
      role: input.role,
      redirectUrl: input.redirectUrl,
      publicMetadata: input.publicMetadata,
    });
    return { id: inv.id };
  } catch (err) {
    throw new ClerkSyncError(`Clerk createOrganizationInvitation failed: ${explain(err)}`, err);
  }
}

export interface CreateClerkMembershipInput {
  clerkOrgId: string;
  clerkUserId: string;
  role: "org:admin" | "org:member";
}

export async function createClerkMembership(
  input: CreateClerkMembershipInput,
): Promise<{ id: string }> {
  const client = await clerk();
  try {
    const m = await client.organizations.createOrganizationMembership({
      organizationId: input.clerkOrgId,
      userId: input.clerkUserId,
      role: input.role,
    });
    return { id: m.id };
  } catch (err) {
    throw new ClerkSyncError(`Clerk createOrganizationMembership failed: ${explain(err)}`, err);
  }
}

export async function updateClerkMembershipRole(input: CreateClerkMembershipInput): Promise<void> {
  const client = await clerk();
  try {
    await client.organizations.updateOrganizationMembership({
      organizationId: input.clerkOrgId,
      userId: input.clerkUserId,
      role: input.role,
    });
  } catch (err) {
    throw new ClerkSyncError(`Clerk updateOrganizationMembership failed: ${explain(err)}`, err);
  }
}

export async function deleteClerkMembership(input: {
  clerkOrgId: string;
  clerkUserId: string;
}): Promise<void> {
  const client = await clerk();
  try {
    await client.organizations.deleteOrganizationMembership({
      organizationId: input.clerkOrgId,
      userId: input.clerkUserId,
    });
  } catch (err) {
    throw new ClerkSyncError(`Clerk deleteOrganizationMembership failed: ${explain(err)}`, err);
  }
}

export interface UpdateClerkLogoInput {
  clerkOrgId: string;
  uploaderUserId: string;
  /** Server-side `File` (or any Blob with a name + type). */
  file: File;
}

export async function updateClerkOrgLogo(input: UpdateClerkLogoInput): Promise<{ imageUrl: string | null }> {
  const client = await clerk();
  try {
    const org = await client.organizations.updateOrganizationLogo(input.clerkOrgId, {
      uploaderUserId: input.uploaderUserId,
      file: input.file,
    });
    return { imageUrl: org.imageUrl ?? null };
  } catch (err) {
    throw new ClerkSyncError(`Clerk updateOrganizationLogo failed: ${explain(err)}`, err);
  }
}

/**
 * Fetch the Clerk-side view of an org for the admin UI's "Clerk linkage"
 * panel. Returns null if the org doesn't exist (e.g. deleted out from
 * under us in Clerk dashboard).
 */
export async function fetchClerkOrg(
  clerkOrgId: string,
): Promise<null | {
  id: string;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  membersCount: number | null;
  publicMetadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}> {
  const client = await clerk();
  try {
    const org = await client.organizations.getOrganization({ organizationId: clerkOrgId });
    return {
      id: org.id,
      name: org.name,
      slug: org.slug ?? null,
      imageUrl: org.imageUrl ?? null,
      membersCount: org.membersCount ?? null,
      publicMetadata: (org.publicMetadata ?? {}) as Record<string, unknown>,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  } catch (err) {
    // 404 from Clerk means "no such org" — return null for that, throw for everything else.
    const anyErr = err as { status?: number; errors?: Array<{ code?: string }> };
    if (anyErr.status === 404 || anyErr.errors?.[0]?.code === "resource_not_found") {
      return null;
    }
    throw new ClerkSyncError(`Clerk getOrganization failed: ${explain(err)}`, err);
  }
}

/**
 * Best-effort wrapper. Logs failures rather than throwing — useful in
 * places where we want Clerk in sync but don't want to fail the request
 * if Clerk is briefly unreachable.
 */
export async function tryClerk<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[clerk-org-service] ${label}: ${message}`);
    return { ok: false, error: message };
  }
}
