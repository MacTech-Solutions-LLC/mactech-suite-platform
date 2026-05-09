"use client";

/**
 * AskAIPanel — Slice 8.
 *
 * Drop-in panel for any Command Center dashboard. Renders an
 * inline collapsible card: "Ask AI" → opens to a prompt textarea +
 * optional "send to team" toggle + "ask" button. Submits to
 * POST /api/ai/ask.
 *
 * Configurable per-page via props:
 *   - contextKey: which dashboard's data to use as the knowledge base
 *   - defaultPrompt: prefill for a common ask (operator can edit)
 *   - presets: small set of one-click prompt templates
 *   - canEmail: whether the operator's session permits team email send
 *     (the route also gates this; UI just hides the toggle when false)
 *   - defaultRecipients: default emails (server-side default is
 *     env.TEAM_EMAILS — operator can override)
 *   - appKey: optional scope filter
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  Loader2,
  Mail,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContextKey } from "@/lib/services/command-center/ai-ask-service";

export interface AskAIPanelProps {
  contextKey: ContextKey;
  /** Friendly label rendered in the panel header — defaults to a
   *  derivation of contextKey. */
  label?: string;
  /** Prompt prefilled into the textarea. Operator can clear or edit. */
  defaultPrompt?: string;
  /** One-click prompt templates rendered as chips above the textarea. */
  presets?: string[];
  /** Whether to show the "send to team" toggle. False when the
   *  operator's session lacks AGENTS_CREATE. */
  canEmail: boolean;
  /** Default recipients shown when send-to-team is on. Empty array
   *  means "use server default". */
  defaultRecipients?: string[];
  /** Optional scope filter passed through to the service (e.g. an
   *  appKey for the per-app investigate page). */
  appKey?: string;
  /** Whether email is configured server-side. UI shows a hint when
   *  this is false so operators know the toggle won't actually send. */
  emailConfigured: boolean;
}

interface AskResponse {
  ok: boolean;
  answer?: string;
  contextChars?: number;
  llmAvailable?: boolean;
  email?: {
    attempted: boolean;
    sent: boolean;
    skippedReason?: string;
    recipients: string[];
    messageId?: string;
    error?: string;
  } | null;
  error?: string;
  message?: string;
}

export function AskAIPanel(props: AskAIPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(props.defaultPrompt ?? "");
  const [sendToTeam, setSendToTeam] = useState(false);
  const [recipients, setRecipients] = useState(
    (props.defaultRecipients ?? []).join(", "),
  );
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<AskResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const consumedPromptRef = useRef(false);

  // Sprint 19: accept ?prompt=... from deep-links (e.g. the Risk
  // row "Ask AI about this" dropdown). On mount, if the panel's
  // contextKey matches the page we landed on, seed the textarea
  // and auto-open. Strip the param from the URL so refresh doesn't
  // re-trigger.
  useEffect(() => {
    if (consumedPromptRef.current) return;
    const incoming = searchParams.get("prompt");
    if (!incoming) return;
    consumedPromptRef.current = true;
    setPrompt(incoming);
    setOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("prompt");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  const label = props.label ?? labelFromKey(props.contextKey);

  async function ask() {
    if (!prompt.trim()) return;
    setBusy(true);
    setResp(null);
    try {
      const recipientList = recipients
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.includes("@"));
      const r = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextKey: props.contextKey,
          prompt,
          sendToTeam,
          recipients:
            sendToTeam && recipientList.length > 0 ? recipientList : undefined,
          appKey: props.appKey,
        }),
      });
      const body = (await r.json()) as AskResponse;
      setResp(body);
    } catch (err) {
      setResp({
        ok: false,
        error: err instanceof Error ? err.message : "ask_failed",
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyAnswer() {
    if (!resp?.answer) return;
    try {
      await navigator.clipboard.writeText(resp.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Ask AI about {label}
          {props.canEmail ? (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              · email-capable
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div className="space-y-3 border-t border-primary/20 p-3">
          <p className="text-xs text-muted-foreground">
            Asks gpt-4o-mini to answer your question grounded in the {label.toLowerCase()}{" "}
            data on this page (recent rows aggregated as the LLM&apos;s knowledge base).
            {props.canEmail
              ? " Toggle 'send to team' to also email the answer to the configured recipients."
              : null}
          </p>

          {props.presets && props.presets.length > 0 ? (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Templates
              </div>
              <div className="flex flex-wrap gap-1.5">
                {props.presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrompt(p)}
                    className="rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {p.length > 60 ? `${p.slice(0, 57)}…` : p}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="block">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Your question
            </div>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`e.g. "Which security-flagged commits hit ${label.toLowerCase()} this week, and who should review them?"`}
              className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={busy}
            />
          </label>

          {props.canEmail ? (
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={sendToTeam}
                  onChange={(e) => setSendToTeam(e.target.checked)}
                  disabled={busy}
                />
                <Mail className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                Send the answer to the team via email
              </label>
              {sendToTeam ? (
                <label className="block">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                    Recipients (comma-separated; leave blank to use server default)
                  </div>
                  <input
                    type="text"
                    value={recipients}
                    onChange={(e) => setRecipients(e.target.value)}
                    placeholder="patrick@…, brian@…, james@…"
                    className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    disabled={busy}
                  />
                </label>
              ) : null}
              {sendToTeam && !props.emailConfigured ? (
                <div className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 p-2 text-[11px] text-warning">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    RESEND_API_KEY is not configured server-side. The AI answer will
                    render below, but no email will actually be sent until a key is set.
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={busy || !prompt.trim()}
              onClick={ask}
            >
              {busy ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              {busy ? "Thinking…" : sendToTeam ? "Ask + email team" : "Ask"}
            </Button>
            {resp?.answer ? (
              <Button size="sm" variant="ghost" onClick={copyAnswer}>
                {copied ? (
                  <>
                    <Check className="mr-1 h-3 w-3 text-success" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" /> Copy
                  </>
                )}
              </Button>
            ) : null}
          </div>

          {resp ? (
            <div className="space-y-2">
              {resp.ok ? (
                <>
                  <div className="rounded-md border border-border bg-card/40 p-3 text-xs">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                      AI answer
                      {resp.llmAvailable === false ? (
                        <span className="text-warning">· deterministic fallback</span>
                      ) : null}
                      {resp.contextChars ? (
                        <span>· {resp.contextChars.toLocaleString()} chars context</span>
                      ) : null}
                    </div>
                    <pre className="whitespace-pre-wrap font-sans">{resp.answer}</pre>
                  </div>
                  {resp.email?.attempted ? (
                    <div
                      className={`flex items-start gap-1.5 rounded-md border p-2 text-[11px] ${
                        resp.email.sent
                          ? "border-success/30 bg-success/10 text-foreground"
                          : "border-warning/40 bg-warning/10 text-foreground"
                      }`}
                    >
                      <Mail className="mt-0.5 h-3 w-3 shrink-0" />
                      <div>
                        {resp.email.sent ? (
                          <>
                            Email sent to {resp.email.recipients.length} recipient
                            {resp.email.recipients.length === 1 ? "" : "s"}
                            {resp.email.messageId ? (
                              <>
                                {" "}
                                ·{" "}
                                <span className="font-mono text-[10px]">
                                  {resp.email.messageId}
                                </span>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <>
                            Email skipped:{" "}
                            <span className="font-mono">
                              {resp.email.skippedReason ?? resp.email.error ?? "unknown"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  {resp.message ?? resp.error ?? "ask_failed"}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function labelFromKey(key: ContextKey): string {
  switch (key) {
    case "commit_intelligence":
      return "Commit Intelligence";
    case "open_risks":
      return "Open Risks";
    case "ecosystem":
      return "Ecosystem";
    case "deployment_drift":
      return "Deployment Drift";
    case "workflow_failures":
      return "Workflow Failures";
    case "today_digest":
      return "Today";
  }
}
