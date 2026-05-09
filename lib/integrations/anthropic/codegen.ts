/**
 * Anthropic codegen client — Slice 13.
 *
 * The ONLY file in MacTech Suite that talks to api.anthropic.com.
 * Used by the cross-repo patch capability to translate (intent +
 * relevant repo files) into a structured patch.
 *
 * Discipline (mirroring lib/agents/llm.ts for OpenAI):
 *   - The ANTHROPIC_API_KEY only ever appears in this file.
 *   - Output is JSON-shape + parsed with strict validation; if the
 *     parse fails, the capability returns a failure rather than
 *     executing untrusted output.
 *   - Timeouts are enforced; failures return a discriminated union
 *     so the capability can record the reason in AgentRun.
 *   - Nothing this file produces is ever pushed without a human-
 *     reviewable PR (the capability handles that wrapping).
 *   - The system prompt makes the contract explicit: each output
 *     file is a complete file, no diffs, no context windows. That
 *     keeps the apply layer (createOrUpdateFile in cross-repo-write)
 *     trivially safe — we send GitHub the new content, not a patch.
 */

import { env } from "@/lib/env";

export interface CodegenInput {
  /** Plain-English description of what the agent should change.
   *  Comes from the operator who initiated the run. */
  intent: string;
  /** Files we read out of the target repo, providing context. */
  repoFiles: Array<{ path: string; content: string }>;
  /** Repo full name (owner/repo) — included in the system prompt so
   *  Claude can write conventions-aware code. */
  repoFullName: string;
  /** Suggested branch name; Claude can keep it or refine it. */
  branchSuggestion: string;
}

export interface CodegenFile {
  /** Repo-relative path. The capability layer validates this against
   *  the path denylist before applying. */
  path: string;
  /** Full new file contents (NOT a diff). */
  content: string;
  /** "create" | "update" — for the audit log; the apply layer
   *  re-reads the existing file to determine the actual operation. */
  action: "create" | "update";
  /** One-line rationale for this specific file change. */
  rationale: string;
}

export interface CodegenOutput {
  /** Branch name to push to. May differ from the suggestion. */
  branchName: string;
  /** PR title. ≤ 70 chars by convention. */
  prTitle: string;
  /** PR body markdown. The capability layer appends a footer marking
   *  the PR as agent-generated. */
  prBody: string;
  /** Files to create or update on the new branch. */
  files: CodegenFile[];
  /** Plain-English summary of the change for the audit log. */
  summary: string;
}

export type CodegenResult =
  | { ok: true; output: CodegenOutput }
  | { ok: false; reason: "not_configured" | "transient" | "invalid_response"; message?: string };

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929";

export async function generatePatch(input: CodegenInput): Promise<CodegenResult> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "not_configured" };
  }

  const system = `You are the cross-repo patch agent for MacTech Suite. The user is an authorized internal admin. Your job is to produce a complete, reviewable code patch in response to a plain-English intent.

NON-NEGOTIABLE rules:
- Output VALID JSON ONLY in the shape below. No prose, no markdown fences, no commentary.
- Every file in "files" is a COMPLETE FILE, never a diff. The apply layer rewrites the file at that path with this content verbatim.
- Pick a branch name under "mactech-agent/<short-slug>". Keep it under 60 chars, lowercase, hyphens only.
- PR title is one short imperative sentence (≤70 chars). PR body is concise markdown describing the change and why it's safe.
- Match the target repo's existing conventions (framework, style, structure). Read the provided files for context.
- If the intent cannot be safely fulfilled, return an empty "files" array and explain why in "summary".
- DO NOT touch lockfiles, .env files, .github/workflows/, Dockerfiles, middleware files, or any path that smells security-sensitive.
- Keep total LOC across all files small (target <200, hard ceiling 400).

Output JSON shape:
{
  "branchName": string,
  "prTitle": string,
  "prBody": string,
  "summary": string,
  "files": [
    { "path": string, "content": string, "action": "create" | "update", "rationale": string }
  ]
}`;

  // Build the user message with the intent + repo context. Keep the
  // file dump compact but readable; Claude infers conventions from
  // even a small sample of representative files.
  const userParts: string[] = [
    `Target repo: ${input.repoFullName}`,
    `Intent: ${input.intent}`,
    `Branch suggestion (you may refine): ${input.branchSuggestion}`,
    "",
    "Existing repo files for context (each block is a complete file):",
  ];
  for (const f of input.repoFiles) {
    userParts.push("");
    userParts.push(`--- BEGIN FILE: ${f.path} ---`);
    userParts.push(f.content);
    userParts.push(`--- END FILE: ${f.path} ---`);
  }
  const user = userParts.join("\n");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 90_000);
  const startedAt = Date.now();
  let statusForTraffic = 0;
  const reqBody = JSON.stringify({
    model: MODEL,
    max_tokens: 8192,
    temperature: 0.1,
    system,
    messages: [{ role: "user", content: user }],
  });

  try {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: reqBody,
      signal: controller.signal,
    });
    statusForTraffic = resp.status;
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        ok: false,
        reason: "transient",
        message: `anthropic_${resp.status}: ${text.slice(0, 200)}`,
      };
    }
    const body = (await resp.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    // Claude returns content as an array of typed blocks; we need the
    // first text block.
    const text = body.content?.find((b) => b.type === "text")?.text ?? "";
    if (!text) {
      return { ok: false, reason: "invalid_response", message: "empty_text_block" };
    }
    const json = stripJsonFence(text);
    const parsed = safeParseJson(json);
    if (!parsed) {
      return {
        ok: false,
        reason: "invalid_response",
        message: `parse_failed: ${text.slice(0, 200)}`,
      };
    }
    const validated = validate(parsed);
    if (!validated) {
      return {
        ok: false,
        reason: "invalid_response",
        message: "shape_mismatch",
      };
    }
    return { ok: true, output: validated };
  } catch (err) {
    return {
      ok: false,
      reason: "transient",
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(t);
    try {
      const { recordOutboundCall } = await import(
        "@/lib/services/command-center/traffic-service"
      );
      void recordOutboundCall({
        targetLabel: "anthropic",
        endpoint: "anthropic:/v1/messages:codegen",
        method: "POST",
        statusCode: statusForTraffic || 0,
        bytesOut: reqBody.length,
        durationMs: Date.now() - startedAt,
      });
    } catch {
      /* observability never blocks */
    }
  }
}

/** Defensive: Claude sometimes wraps JSON in ```json fences despite the
 *  system prompt. Strip them if present. */
function stripJsonFence(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  return text.trim();
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validate(raw: unknown): CodegenOutput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.branchName !== "string" ||
    typeof r.prTitle !== "string" ||
    typeof r.prBody !== "string" ||
    typeof r.summary !== "string" ||
    !Array.isArray(r.files)
  ) {
    return null;
  }
  const files: CodegenFile[] = [];
  for (const f of r.files) {
    if (!f || typeof f !== "object") return null;
    const fr = f as Record<string, unknown>;
    if (
      typeof fr.path !== "string" ||
      typeof fr.content !== "string" ||
      typeof fr.rationale !== "string" ||
      (fr.action !== "create" && fr.action !== "update")
    ) {
      return null;
    }
    files.push({
      path: fr.path,
      content: fr.content,
      action: fr.action,
      rationale: fr.rationale,
    });
  }
  return {
    branchName: r.branchName,
    prTitle: r.prTitle,
    prBody: r.prBody,
    summary: r.summary,
    files,
  };
}
