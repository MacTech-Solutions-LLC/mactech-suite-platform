import { z } from "zod";

const appKeySchema = z.enum([
  "bizops",
  "client-portal",
  "codex",
  "enclavewatch",
  "finance",
  "governance",
  "growth-capture",
  "hub",
  "proposal",
  "quality",
  "qms",
  "training",
]);

export const suiteEmployeeOnboardingRequestSchema = z.object({
  customerOrganizationId: z.string().min(1).max(200),
  email: z.string().email(),
  firstName: z.string().max(100).optional().or(z.literal("")),
  lastName: z.string().max(100).optional().or(z.literal("")),
  role: z.string().min(1).max(120).default("customer_admin"),
  title: z.string().max(160).optional().or(z.literal("")),
  department: z.string().max(160).optional().or(z.literal("")),
  managerHubUserId: z.string().max(200).optional().or(z.literal("")),
  startDate: z.string().max(40).optional().or(z.literal("")),
  employmentType: z.string().max(80).default("employee"),
  laborCategory: z.string().max(160).optional().or(z.literal("")),
  standardWeekHours: z.coerce.number().positive().max(168).default(40),
  timekeepingRequired: z.boolean().default(true),
  appEntitlements: z.array(appKeySchema).default([]),
  trainingRequirementKeys: z.array(z.string().min(1).max(120)).default([]),
  signingAuthorityKinds: z.array(z.string().min(1).max(120)).default([]),
  sendInvite: z.boolean().default(false),
  source: z
    .object({
      sourceAppKey: z.string().min(1).max(80).default("bizops"),
      sourceRecordId: z.string().max(200).optional().nullable(),
      requestedByHubUserId: z.string().max(200).optional().nullable(),
    })
    .default({ sourceAppKey: "bizops" }),
});

export type SuiteEmployeeOnboardingRequestInput = z.infer<
  typeof suiteEmployeeOnboardingRequestSchema
>;

export function validationIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
