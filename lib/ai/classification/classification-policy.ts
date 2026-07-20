import type { AiClassification } from "@/lib/ai/schemas/chat";

const HOSTED_BLOCKED = new Set<AiClassification>([
  "FCI",
  "CUI",
  "EXPORT_CONTROLLED",
  "SECRET",
  "UNKNOWN",
]);

export interface ClassificationDecision {
  allowed: boolean;
  classification: AiClassification;
  code: string;
  reason: string;
}
export function evaluateClassification(input: {
  classification: AiClassification;
  aiEnabled: boolean;
  externalInference: boolean;
  allowedClassifications: AiClassification[];
}): ClassificationDecision {
  if (!input.aiEnabled) {
    return deny(input.classification, "ai_disabled", "MacTech AI is disabled in this environment.");
  }
  if (HOSTED_BLOCKED.has(input.classification)) {
    return deny(
      input.classification,
      "classification_blocked",
      `${input.classification} content is not permitted in the hosted developer inference environment.`,
    );
  }
  if (!input.allowedClassifications.includes(input.classification)) {
    return deny(input.classification, "classification_not_allowed", "This environment does not allow the selected classification.");
  }
  if (!input.externalInference && input.classification !== "PUBLIC" && input.classification !== "INTERNAL") {
    return deny(input.classification, "external_inference_disabled", "External inference is disabled for this classification.");
  }
  return {
    allowed: true,
    classification: input.classification,
    code: "allowed",
    reason: "Classification policy permits this request.",
  };
}

function deny(classification: AiClassification, code: string, reason: string): ClassificationDecision {
  return { allowed: false, classification, code, reason };
}
