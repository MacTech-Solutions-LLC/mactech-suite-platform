/**
 * Email client — Slice 8.
 *
 * The ONLY file in the codebase that holds the Resend API token. Same
 * AgentOps discipline as the OpenAI / GitHub / Railway clients: token
 * stays here, callers receive a high-level send() and never see the
 * key. Slice 6.1 traffic instrumentation wraps every call so outbound
 * email shows up on /admin/ops/traffic + the synthetic external node
 * "resend" appears on the ecosystem map once any email is sent.
 *
 * Defensive: if RESEND_API_KEY is unset, send() becomes a logging
 * no-op. The AI narrative still renders in the UI; the email path
 * just shows "would have sent" in the response. This lets the slice
 * ship before a Resend account exists, with zero error path on the
 * dashboard.
 */

import { env } from "@/lib/env";

export interface SendEmailInput {
  to: string[];
  subject: string;
  /** Plain-text body. Required even when html is set — fallback for
   *  clients that strip HTML (audit replay, security tooling, etc). */
  text: string;
  /** Optional HTML body. Resend renders this if both are present. */
  html?: string;
  /** Reply-to override (defaults to env.EMAIL_FROM). */
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** Resend message id when send succeeded. */
  messageId?: string;
  /** Reason when send was skipped (no key configured). */
  skippedReason?: "not_configured" | "no_recipients";
  /** HTTP status from Resend (when configured). */
  status?: number;
  /** Error string when send failed at Resend. */
  error?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/**
 * Send an email via Resend. Never throws — observability + UX
 * affordance. Caller renders skipped vs sent vs failed differently.
 */
export async function sendTeamEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (input.to.length === 0) {
    return { ok: false, skippedReason: "no_recipients" };
  }
  if (!emailConfigured()) {
    console.info(
      `[email] RESEND_API_KEY unset — would have sent "${input.subject}" to ${input.to.length} recipient(s)`,
    );
    return { ok: false, skippedReason: "not_configured" };
  }

  const apiKey = env.RESEND_API_KEY!;
  const from = env.EMAIL_FROM;

  const startedAt = Date.now();
  const bodyJson = JSON.stringify({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    reply_to: input.replyTo,
  });

  let statusForTraffic = 0;
  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: bodyJson,
    });
    statusForTraffic = resp.status;
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      return {
        ok: false,
        status: resp.status,
        error: errBody.slice(0, 500),
      };
    }
    const body = (await resp.json()) as { id?: string };
    return { ok: true, messageId: body.id, status: resp.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  } finally {
    // Outbound traffic instrumentation. Lazy-imported to avoid
    // load-order coupling, same pattern as the GitHub / Railway /
    // OpenAI clients (slice 6.1).
    try {
      const { recordOutboundCall } = await import(
        "@/lib/services/command-center/traffic-service"
      );
      void recordOutboundCall({
        targetLabel: "resend",
        endpoint: "resend:/emails",
        method: "POST",
        statusCode: statusForTraffic || 0,
        bytesOut: bodyJson.length,
        durationMs: Date.now() - startedAt,
      });
    } catch {
      /* observability never blocks */
    }
  }
}
