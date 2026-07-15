import type { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { normalizeEmail } from "@/lib/email-normalize";
import { CUSTOMER_ROLE_DEFINITIONS } from "@/lib/permissions";
import type { VerifiedHubService } from "@/lib/hub-authority";
import { createSuiteObjectReference } from "@/lib/suite-object-reference";
import {
  suiteEmployeeOnboardingRequestSchema,
  type SuiteEmployeeOnboardingRequestInput,
} from "@/lib/validations/employee-onboarding";

export async function onboardSuiteEmployee(
  rawInput: SuiteEmployeeOnboardingRequestInput,
  service: VerifiedHubService,
) {
  const input = suiteEmployeeOnboardingRequestSchema.parse(rawInput);
  const email = normalizeEmail(input.email);
  const sourceAppKey = service.sourceAppKey;

  const org = await prisma.customerOrganization.findUnique({
    where: { id: input.customerOrganizationId },
  });
  if (!org) throw new Error("Customer organization not found.");

  const role =
    CUSTOMER_ROLE_DEFINITIONS.find((item) => item.key === input.role) ??
    CUSTOMER_ROLE_DEFINITIONS.find((item) => item.key === "customer_admin");
  if (!role) throw new Error(`Unknown customer role: ${input.role}`);

  const profile = await prisma.userProfile.upsert({
    where: { email },
    update: {
      firstName: input.firstName || undefined,
      lastName: input.lastName || undefined,
      jobTitle: input.title || undefined,
      department: input.department || undefined,
      managerUserProfileId: input.managerHubUserId || undefined,
      employmentStartDate: input.startDate ? new Date(input.startDate) : undefined,
      employmentType: input.employmentType,
      laborCategory: input.laborCategory || undefined,
      standardWeekHours: input.standardWeekHours,
      timekeepingRequired: input.timekeepingRequired,
      authorityVersion: { increment: 1 },
    },
    create: {
      email,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      clerkUserId: `pending_${Date.now()}_${randomUUID()}`,
      isInternalMacTechUser: false,
      platformRole: "none",
      status: "invited",
      jobTitle: input.title || null,
      department: input.department || null,
      managerUserProfileId: input.managerHubUserId || null,
      employmentStartDate: input.startDate ? new Date(input.startDate) : null,
      employmentType: input.employmentType,
      laborCategory: input.laborCategory || null,
      standardWeekHours: input.standardWeekHours,
      timekeepingRequired: input.timekeepingRequired,
    },
  });

  const access = await prisma.orgUserAccess.upsert({
    where: {
      customerOrganizationId_userProfileId: {
        customerOrganizationId: org.id,
        userProfileId: profile.id,
      },
    },
    update: {
      role: role.key,
      permissionsJson: role.permissions as unknown as Prisma.InputJsonValue,
      authorityVersion: { increment: 1 },
    },
    create: {
      customerOrganizationId: org.id,
      userProfileId: profile.id,
      role: role.key,
      permissionsJson: role.permissions as unknown as Prisma.InputJsonValue,
      status: "invited",
    },
  });

  const profileReference = await createSuiteObjectReference(
    {
      sourceAppKey,
      owningAppKey: "identity-command-center",
      objectType: "hub.user_profile",
      objectId: profile.id,
      objectVersion: String(profile.authorityVersion),
      tenantOrgId: org.id,
      organizationId: org.id,
      createdByHubUserId: input.source.requestedByHubUserId ?? null,
      metadataJson: {
        email,
        membershipId: access.id,
        sourceRecordId: input.source.sourceRecordId ?? null,
        requestedApps: input.appEntitlements,
        trainingRequirementKeys: input.trainingRequirementKeys,
        signingAuthorityKinds: input.signingAuthorityKinds,
        managerUserProfileId: input.managerHubUserId || null,
        employmentType: input.employmentType,
        laborCategory: input.laborCategory || null,
        standardWeekHours: input.standardWeekHours,
        timekeepingRequired: input.timekeepingRequired,
      },
    },
    service,
  );

  await writeAuditLog({
    eventType: "employee_onboarding.requested",
    eventCategory: "user",
    severity: "info",
    action: `Created employee onboarding profile for ${email}`,
    actorUserProfileId: input.source.requestedByHubUserId ?? null,
    customerOrganizationId: org.id,
    resourceType: "UserProfile",
    resourceId: profile.id,
    metadata: {
      sourceAppKey,
      sourceRecordId: input.source.sourceRecordId ?? null,
      membershipId: access.id,
      role: role.key,
      title: input.title || null,
      department: input.department || null,
      managerHubUserId: input.managerHubUserId || null,
      startDate: input.startDate || null,
      requestedApps: input.appEntitlements,
      trainingRequirementKeys: input.trainingRequirementKeys,
      signingAuthorityKinds: input.signingAuthorityKinds,
      sendInviteRequested: input.sendInvite,
      clerkInviteStatus: "deferred_to_hub_admin_flow",
    },
  });

  return {
    ok: true,
    hubUser: {
      id: profile.id,
      clerkUserId: profile.clerkUserId,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      status: profile.status,
    },
    organization: {
      id: org.id,
      name: org.name,
      clerkOrgId: org.clerkOrgId,
    },
    membership: {
      id: access.id,
      role: access.role,
      status: access.status,
    },
    suiteObjectReference: {
      id: profileReference.id,
      objectType: profileReference.objectType,
      owningAppKey: profileReference.owningAppKey,
    },
    onboarding: {
      status: "profile_created",
      requestedApps: input.appEntitlements,
      trainingRequirementKeys: input.trainingRequirementKeys,
      signingAuthorityKinds: input.signingAuthorityKinds,
      followUps: buildFollowUps(input),
    },
  };
}

function buildFollowUps(input: SuiteEmployeeOnboardingRequestInput) {
  const followUps = [
    {
      appKey: "hub",
      owner: "Hub",
      action: "Confirm Clerk invitation delivery and org membership activation.",
    },
  ];
  for (const appKey of input.appEntitlements) {
    followUps.push({
      appKey,
      owner: appKey,
      action: "Resolve access from Hub authority snapshot before local record creation.",
    });
  }
  if (input.trainingRequirementKeys.length) {
    followUps.push({
      appKey: "training",
      owner: "Training",
      action: "Assign required training and preserve completion evidence against the Hub user id.",
    });
  }
  if (input.signingAuthorityKinds.length) {
    followUps.push({
      appKey: "governance",
      owner: "Governance",
      action: "Review requested signing/delegation authority before any approval or signature use.",
    });
  }
  return followUps;
}
