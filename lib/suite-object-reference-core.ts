export const SUPPORTED_SUITE_OBJECT_TYPES = [
  "capture.opportunity",
  "capture.package",
  "governance.requirement",
  "governance.review",
  "hub.user_profile",
  "workspace.source_item",
  "qms.document",
  "qms.document_version",
  "training.assignment",
  "training.completion",
  "pricing.pricing_model",
  "pricing.locked_pricing_version",
  // Legacy aliases retained so existing references remain readable during migration.
  "finance.pricing_model",
  "finance.locked_pricing_version",
  "proposal.package",
  "codex.evidence_item",
  "codex.evidence_package",
  "mackali.finding",
  "cyberrange.mission_export",
] as const;

export type SupportedSuiteObjectType = (typeof SUPPORTED_SUITE_OBJECT_TYPES)[number];

export const IMMUTABLE_SUITE_OBJECT_TYPES = new Set<string>([
  "capture.package",
  "qms.document_version",
  "pricing.locked_pricing_version",
  "finance.locked_pricing_version",
  "proposal.package",
  "codex.evidence_package",
  "cyberrange.mission_export",
]);

export interface SuiteObjectReferenceValidationInput {
  sourceAppKey: string;
  owningAppKey: string;
  objectType: string;
  objectId: string;
  objectVersion?: string | null;
  objectHash?: string | null;
  tenantOrgId?: string | null;
  organizationId?: string | null;
  deprecatedAt?: Date | string | null;
  replacedByReferenceId?: string | null;
}

export function validateSuiteObjectReferenceShape(input: SuiteObjectReferenceValidationInput) {
  if (!input.sourceAppKey) throw new SuiteObjectReferenceValidationError("sourceAppKey is required.");
  if (!input.owningAppKey) throw new SuiteObjectReferenceValidationError("owningAppKey is required.");
  if (!isSupportedSuiteObjectType(input.objectType)) {
    throw new SuiteObjectReferenceValidationError(`Unsupported objectType: ${input.objectType}`);
  }
  if (!input.objectId) throw new SuiteObjectReferenceValidationError("objectId is required.");
  if (IMMUTABLE_SUITE_OBJECT_TYPES.has(input.objectType) && !input.objectHash) {
    throw new SuiteObjectReferenceValidationError("objectHash is required for immutable artifacts and exports.");
  }
  if (input.deprecatedAt && !input.replacedByReferenceId) {
    throw new SuiteObjectReferenceValidationError("replacedByReferenceId is required when deprecating a reference.");
  }
}

export function assertReferenceActive(reference: {
  id: string;
  deprecatedAt?: Date | string | null;
  verificationStatus?: string | null;
}) {
  if (reference.deprecatedAt || reference.verificationStatus === "deprecated") {
    throw new SuiteObjectReferenceValidationError(`SuiteObjectReference ${reference.id} is deprecated and cannot be used as an active handoff.`);
  }
}

export function isSupportedSuiteObjectType(value: string): value is SupportedSuiteObjectType {
  return (SUPPORTED_SUITE_OBJECT_TYPES as readonly string[]).includes(value);
}

export class SuiteObjectReferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuiteObjectReferenceValidationError";
  }
}
