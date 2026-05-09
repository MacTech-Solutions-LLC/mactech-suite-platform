"use client";

/**
 * Copy-paste tool spec for Anthropic Claude tool-use. Drops onto the
 * /admin/agents page when the operator holds AGENTS_VIEW. Shows the
 * exact JSON schema Claude (or any tool-use-compatible runtime) needs
 * to call POST /api/v1/agents/runs against this Suite — including the
 * IBE Intent payload requirement.
 *
 * Pure-display + clipboard. No network calls. The actual API key has
 * to be issued at /admin/api-keys with `agents_trigger` scope; we
 * NEVER show or generate keys here.
 */

import { useState } from "react";
import { Copy, KeyRound, Check } from "lucide-react";
import { Chip } from "@/components/ui/chip";

const TOOL_SPEC_PYTHON = `# Anthropic Claude tool-use registration (Python SDK):
TOOL = {
    "name": "mactech_agent_run",
    "description": (
        "Trigger an IBE-gated AgentOps run on the MacTech Suite Command "
        "Center. Always supply an explicit Intent (goal + scope + "
        "invariants + risk_tolerance). Read-only-only plans auto-execute; "
        "plans with any approval_required step return awaiting_approval "
        "and need a human admin to approve at the reviewUrl."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "request": {"type": "string", "description": "Natural-language request fed to the planner."},
            "intent": {
                "type": "object",
                "required": ["goal", "scopeAppIds", "scopeRepoIds", "invariants", "riskTolerance"],
                "properties": {
                    "goal": {"type": "string", "description": "Verb + measurable outcome, ends in period."},
                    "scopeAppIds": {"type": "array", "items": {"type": "string"}, "description": "Empty = unbounded."},
                    "scopeRepoIds": {"type": "array", "items": {"type": "string"}, "description": "Empty = unbounded."},
                    "invariants": {"type": "object", "description": "Map: capabilityKey -> [invariantKey]."},
                    "riskTolerance": {"type": "string", "enum": ["strict", "moderate", "permissive"]},
                },
            },
            "autoExecute": {"type": "boolean", "default": True},
        },
        "required": ["request", "intent"],
    },
}

# Tool execution handler:
import os, requests
def run_mactech_agent(args):
    resp = requests.post(
        "https://www.suite.mactechsolutionsllc.com/api/v1/agents/runs",
        headers={
            "Authorization": f"Bearer {os.environ['MACTECH_AGENTS_TRIGGER_KEY']}",
            "Content-Type": "application/json",
        },
        json=args,
        timeout=60,
    )
    return resp.json()
`;

const CURL_EXAMPLE = `curl -sS https://www.suite.mactechsolutionsllc.com/api/v1/agents/runs \\
  -H "Authorization: Bearer $MACTECH_AGENTS_TRIGGER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "request": "Summarize every open operational risk by severity.",
    "intent": {
      "goal": "Summarize every open operational risk by severity.",
      "scopeAppIds": [],
      "scopeRepoIds": [],
      "invariants": {
        "summarize_open_risks": ["count_non_negative", "no_critical_present"]
      },
      "riskTolerance": "strict"
    },
    "autoExecute": true
  }'`;

export function ClaudeToolSpec() {
  const [tab, setTab] = useState<"curl" | "python">("curl");
  const [copied, setCopied] = useState(false);

  function copy() {
    const text = tab === "curl" ? CURL_EXAMPLE : TOOL_SPEC_PYTHON;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* ignore */
      });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Trigger from Claude (or any automation)</div>
      </div>
      <p className="text-xs text-muted-foreground">
        Issue an API key at <code className="font-mono text-[11px]">/admin/api-keys</code> with the{" "}
        <code className="font-mono text-[11px]">agents_trigger</code> scope, then POST an
        IBE-gated Intent to{" "}
        <code className="font-mono text-[11px]">/api/v1/agents/runs</code>. Read-only plans
        auto-execute; writes still bounce to a human approver.
      </p>
      <div className="flex items-center gap-2">
        <Chip
          variant="tab"
          size="xs"
          pressed={tab === "curl"}
          onClick={() => setTab("curl")}
          ariaLabel="Show curl example"
          className="uppercase tracking-widest"
        >
          curl
        </Chip>
        <Chip
          variant="tab"
          size="xs"
          pressed={tab === "python"}
          onClick={() => setTab("python")}
          ariaLabel="Show Claude tool-use Python example"
          className="uppercase tracking-widest"
        >
          claude tool-use (python)
        </Chip>
        <Chip
          variant="ghost"
          size="xs"
          onClick={copy}
          ariaLabel={copied ? "Copied to clipboard" : "Copy snippet to clipboard"}
          className="ml-auto"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-success" aria-hidden="true" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden="true" /> Copy
            </>
          )}
        </Chip>
      </div>
      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[11px] leading-snug">
        {tab === "curl" ? CURL_EXAMPLE : TOOL_SPEC_PYTHON}
      </pre>
    </div>
  );
}
