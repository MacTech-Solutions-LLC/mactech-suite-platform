/**
 * Optional AI summary client. Disabled by default; only fires when
 * ENABLE_AI_SUMMARIES=true AND OPENAI_API_KEY is configured. Until
 * then, the deterministic summary path in commit-summary-service
 * produces the same shape (`executiveSummary` + `technicalSummary` +
 * `complianceImpact` + `riskSummary`) without leaving the process.
 *
 * AgentOps discipline: this is the only file in the codebase that
 * speaks to OpenAI. The Slice 5 capability `generate_release_notes`
 * is a thin wrapper over this; it never reads the API key directly.
 */

import { env } from "@/lib/env";

export interface AiSummaryInput {
  /** Bullet-point list of commits in the range. Each line is one commit. */
  commitLines: string[];
  /** App keys + names this summary covers. */
  apps: Array<{ appKey: string; name: string }>;
  /** GitCommitEvent rows the security_sensitive_change evaluator flagged. */
  sensitiveCommits: Array<{ shortSha: string; message: string; categories: string[] }>;
  /** "daily" | "weekly" | … — drives prompt tone. */
  summaryType: string;
}

export interface AiSummaryOutput {
  executiveSummary: string;
  technicalSummary: string;
  complianceImpact: string | null;
  riskSummary: string | null;
}

export function aiSummariesConfigured(): boolean {
  return Boolean(env.ENABLE_AI_SUMMARIES && env.OPENAI_API_KEY);
}

/**
 * Generate the four summary fields via OpenAI. Returns null when
 * AI summaries are disabled — caller falls back to the deterministic
 * generator.
 *
 * Defensive: timeouts, no token leak, redacted errors.
 */
export async function generateAiSummary(
  input: AiSummaryInput,
): Promise<AiSummaryOutput | null> {
  if (!aiSummariesConfigured()) return null;
  const apiKey = env.OPENAI_API_KEY!;

  const system = `You write concise, executive-readable software-ecosystem summaries for the MacTech Suite Command Center. The audience is internal admins and assessors. Tone: direct, calm, federal-grade. No emoji. No marketing language. Output VALID JSON ONLY with keys executiveSummary (2-3 sentences), technicalSummary (bullet list), complianceImpact (1-2 sentences or empty), riskSummary (1-2 sentences or empty).`;

  const user = `Summary type: ${input.summaryType}
Apps covered: ${input.apps.map((a) => `${a.appKey} (${a.name})`).join(", ") || "(none)"}
Commits in range:
${input.commitLines.length === 0 ? "(none)" : input.commitLines.map((l) => `- ${l}`).join("\n")}

Security-sensitive commits flagged by the path classifier:
${
  input.sensitiveCommits.length === 0
    ? "(none)"
    : input.sensitiveCommits
        .map((c) => `- ${c.shortSha} [${c.categories.join(",")}] ${c.message}`)
        .join("\n")
}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30_000);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      console.warn(`[ai-summary] non-ok response ${resp.status}`);
      return null;
    }
    const body = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as Partial<AiSummaryOutput>;
    if (
      typeof parsed.executiveSummary !== "string" ||
      typeof parsed.technicalSummary !== "string"
    ) {
      return null;
    }
    return {
      executiveSummary: parsed.executiveSummary,
      technicalSummary: parsed.technicalSummary,
      complianceImpact: typeof parsed.complianceImpact === "string" ? parsed.complianceImpact : null,
      riskSummary: typeof parsed.riskSummary === "string" ? parsed.riskSummary : null,
    };
  } catch {
    // Timeout, network error, JSON parse error — fall back to
    // deterministic generator. Never crashes the caller.
    return null;
  } finally {
    clearTimeout(t);
  }
}
