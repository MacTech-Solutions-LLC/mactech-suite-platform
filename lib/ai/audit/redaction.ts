import { createHash } from "crypto";

const SECRET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  { label: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}/i },
  { label: "github_token", pattern: /\bgh[opsu]_[A-Za-z0-9]{20,}\b/i },
  { label: "nvidia_api_key", pattern: /\bnvapi-[A-Za-z0-9_-]{16,}\b/i },
  { label: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "password_assignment", pattern: /\bpassword\s*[:=]\s*\S+/i },
  { label: "connection_string", pattern: /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql):\/\/[^\s]+/i },
  { label: "session_token", pattern: /\b(?:session|token|api[_-]?key|secret)\s*[:=]\s*["']?[A-Za-z0-9._~+\/-]{12,}/i },
];

export interface SecretScanResult {
  detected: boolean;
  labels: string[];
  redacted: string;
}

export function scanAndRedactSecrets(value: string): SecretScanResult {
  const labels: string[] = [];
  let redacted = value;
  for (const entry of SECRET_PATTERNS) {
    if (entry.pattern.test(redacted)) labels.push(entry.label);
    redacted = redacted.replace(new RegExp(entry.pattern.source, `${entry.pattern.flags.replace("g", "")}g`), `[REDACTED:${entry.label}]`);
  }
  return { detected: labels.length > 0, labels: Array.from(new Set(labels)), redacted };
}

export function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
