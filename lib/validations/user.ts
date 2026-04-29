import { z } from "zod";

export const UserStatusEnum = z.enum(["active", "suspended", "invited"]);

export const PlatformRoleEnum = z.enum([
  "mactech_super_admin",
  "mactech_admin",
  "mactech_support",
  "mactech_auditor",
  "mactech_read_only",
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

export const addUserToOrgSchema = z.object({
  userProfileId: z.string().min(1),
  customerOrganizationId: z.string().min(1),
  role: z.string().min(1),
});

export type AddUserToOrgInput = z.infer<typeof addUserToOrgSchema>;
