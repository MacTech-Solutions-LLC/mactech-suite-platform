/**
 * POST /api/ai/ask — Slice 8.
 *
 * Generic "ask AI a question grounded in this dashboard's data"
 * endpoint. The browser-side AskAIPanel POSTs here from any page
 * that drops the panel.
 *
 * Body:
 *   {
 *     contextKey: "commit_intelligence" | "open_risks" | "ecosystem"
 *               | "deployment_drift" | "workflow_failures",
 *     prompt: string,
 *     sendToTeam?: boolean,
 *     recipients?: string[],   // optional override of TEAM_EMAILS
 *     appKey?: string          // optional scope filter
 *   }
 *
 * Permission: routes are gated on OPS_VIEW (a baseline read perm; if
 * you can see the underlying dashboard, you can ask the AI about it).
 * Email send is additionally gated to AGENTS_CREATE — only members
 * who can plan agent runs are allowed to fire team emails, since the
 * email blast is functionally equivalent to broadcasting to leadership.
 */

import { type NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requireAuthContext } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { ask, type ContextKey } from "@/lib/services/command-center/ai-ask-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_CONTEXTS: ContextKey[] = [
  "commit_intelligence",
  "open_risks",
  "ecosystem",
  "deployment_drift",
  "workflow_failures",
];

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuthContext();
    // Baseline gate: must hold OPS_VIEW (every Command Center
    // dashboard the panel sits on requires it).
    if (!ctx.permissions.includes(PLATFORM_PERMISSIONS.OPS_VIEW)) {
      return NextResponse.json(
        { ok: false, error: "permission_denied" },
        { status: 403 },
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
    }

    const contextKey = body.contextKey;
    if (
      typeof contextKey !== "string" ||
      !ALLOWED_CONTEXTS.includes(contextKey as ContextKey)
    ) {
      return NextResponse.json(
        { ok: false, error: "context_key_invalid" },
        { status: 400 },
      );
    }

    const prompt = body.prompt;
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "prompt_required" },
        { status: 400 },
      );
    }
    if (prompt.length > 4000) {
      return NextResponse.json(
        { ok: false, error: "prompt_too_long" },
        { status: 400 },
      );
    }

    const sendToTeam = body.sendToTeam === true;
    if (sendToTeam && !ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_CREATE)) {
      return NextResponse.json(
        {
          ok: false,
          error: "email_permission_denied",
          message:
            "AGENTS_CREATE is required to fire team emails — broadcasting to leadership has the same blast radius as an agent run.",
        },
        { status: 403 },
      );
    }

    const recipients = Array.isArray(body.recipients)
      ? body.recipients.filter((s): s is string => typeof s === "string")
      : undefined;

    const appKey = typeof body.appKey === "string" ? body.appKey : undefined;

    const result = await ask({
      contextKey: contextKey as ContextKey,
      prompt: prompt.trim(),
      sendToTeam,
      recipients,
      appKey,
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
    });

    return NextResponse.json({
      ok: true,
      answer: result.answer,
      contextChars: result.contextChars,
      llmAvailable: result.llmAvailable,
      email: result.email ?? null,
    });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      const status =
        err.code === "unauthenticated"
          ? 401
          : err.code === "permission_denied" || err.code === "no_platform_access"
            ? 403
            : 400;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    console.error("[api/ai/ask]", err);
    return NextResponse.json({ ok: false, error: "ask_failed" }, { status: 500 });
  }
}
