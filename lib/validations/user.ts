import { z } from "zod";

export const UserStatusEnum = z.enum([
  "active",
  "suspended",
  "invited",
  "inactive",
  "revoked",
  "expired",
  "deleted",
]);

export const PlatformRoleEnum = z.enum([
  "mactech_super_admin",
  "mactech_admin",
  "mactech_support",
  "mactech_auditor",
  "mactech_read_only",
  "cui_auditor",
  "none",
]);

export const inviteCustomerUserSchema = z.object({
  customerOrganizationId: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().max(100).optional().or(z.literal("")),
  lastName: z.string().max(100).optional().or(z.literal("")),
  role: z.string().min(1),
  productAccess: z.array(z.string()).default([]),
  sendInvite: z.boolean().default(true),
});

export type InviteCustomerUserInput = z.infer<typeof inviteCustomerUserSchema>;

export const updateOrgUserAccessSchema = z.object({
  customerOrganizationId: z.string().min(1),
  userProfileId: z.string().min(1),
  role: z.string().min(1).optional(),
  status: UserStatusEnum.optional(),
});

export type UpdateOrgUserAccessInput = z.infer<typeof updateOrgUserAccessSchema>;

export const updatePlatformUserSchema = z.object({
  userProfileId: z.string().min(1),
  platformRole: PlatformRoleEnum.optional(),
  status: UserStatusEnum.optional(),
});

export type UpdatePlatformUserInput = z.infer<typeof updatePlatformUserSchema>;

export const removeOrgUserAccessSchema = z.object({
  customerOrganizationId: z.string().min(1),
  userProfileId: z.string().min(1),
});

export type RemoveOrgUserAccessInput = z.infer<typeof removeOrgUserAccessSchema>;

export const resendCustomerInvitationSchema = z.object({
  customerOrganizationId: z.string().min(1),
  userProfileId: z.string().min(1),
});

export type ResendCustomerInvitationInput = z.infer<
  typeof resendCustomerInvitationSchema
>;

/** PlatformRoleEnum minus "none" — "none" is the revocation sentinel,
 *  not a role you can invite a new admin into. */
export const MacTechPlatformRoleEnum = z.enum([
  "mactech_super_admin",
  "mactech_admin",
  "mactech_support",
  "mactech_auditor",
  "mactech_read_only",
  "cui_auditor",
]);

export const inviteMacTechAdminSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(100).optional().or(z.literal("")),
  lastName: z.string().max(100).optional().or(z.literal("")),
  platformRole: MacTechPlatformRoleEnum,
});

export type InviteMacTechAdminInput = z.infer<typeof inviteMacTechAdminSchema>;

export const addUserToOrgSchema = z.object({
  userProfileId: z.string().min(1),
  customerOrganizationId: z.string().min(1),
  role: z.string().min(1),
});

export type AddUserToOrgInput = z.infer<typeof addUserToOrgSchema>;
