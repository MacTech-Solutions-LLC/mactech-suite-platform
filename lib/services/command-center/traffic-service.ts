/**
 * Inter-app traffic observability — Slice 6.
 *
 * Captures one row per inbound HTTP call to a Suite endpoint that
 * crosses an app boundary. AppDependency = declared edges; AppCallEvent
 * = observed edges. The two surface together on /admin/ops/ecosystem
 * (declared edges always shown; observed edges modulate stroke width)
 * and apart on /admin/ops/traffic (the raw call log).
 *
 * Fire-and-forget: every record() call wraps the prisma insert in a
 * promise that never rejects (it logs + drops on failure). A traffic
 * row never blocks an API response — observability code MUST NOT take
 * a request down with it.
 */

import { prisma } from "@/lib/db/prisma";
import { redactMetadata } from "@/lib/audit";
import { Prisma } from "@prisma/client";

export interface RecordCallInput {
  /** Target AppRegistry id — typically suite (identity-command-center). */
  targetAppRegistryId?: string | null;
  /** Source AppRegistry id when caller is one of our apps. */
  sourceAppRegistryId?: string | null;
  /**
   * Canonical caller label. Required. For app-to-app traffic this is
   * the source's appKey (e.g. "training", "quality"). For external
   * sources use "github" / "railway" / "clerk" / "anonymous".
   */
  sourceLabel: string;
  /**
   * Canonical target label. Slice 6.1 — defaults to
   * "identity-command-center" (the inbound case). For outbound calls
   * Suite makes, set to "github" / "railway" / "openai" so the
   * traffic graph attributes the call to the right external service.
   */
  targetLabel?: string;
  /** Route pattern, NOT the literal URL. e.g. "/api/audit/ingest". */
  endpoint: string;
  method: string;
  statusCode: number;
  bytesIn?: number;
  bytesOut?: number;
  durationMs?: number;
  apiKeyId?: string | null;
  requestId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * Record a single call event. Non-blocking, exception-safe. Awaiting
 * this is optional — if you don't await it the response goes out
 * without waiting on the insert; if you do, you get a tiny extra
 * latency. Either is fine.
 */
export async function recordAppCall(input: RecordCallInput): Promise<void> {
  try {
    await prisma.appCallEvent.create({
      data: {
        targetAppRegistryId: input.targetAppRegistryId ?? null,
        sourceAppRegistryId: input.sourceAppRegistryId ?? null,
        sourceLabel: input.sourceLabel,
        targetLabel: input.targetLabel ?? "identity-command-center",
        endpoint: input.endpoint,
        method: input.method,
        statusCode: input.statusCode,
        bytesIn: input.bytesIn ?? 0,
        bytesOut: input.bytesOut ?? 0,
        durationMs: input.durationMs ?? null,
        apiKeyId: input.apiKeyId ?? null,
        requestId: input.requestId ?? null,
        metadataJson: input.metadata
          ? (redactMetadata(input.metadata) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  } catch (err) {
    // Observability must never take a request down. Log + drop.
    console.warn(
      `[traffic] failed to record call ${input.sourceLabel} → ${input.endpoint}: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────
// Aggregation queries — power the ecosystem map enrichment + the
// /admin/ops/traffic page.
// ───────────────────────────────────────────────────────────────────────

export interface PairTrafficSummary {
  sourceAppRegistryId: string | null;
  targetAppRegistryId: string | null;
  sourceLabel: string;
  targetLabel: string;
  callCount: number;
  bytesIn: number;
  bytesOut: number;
  errorCount: number;
  lastSeenAt: Date;
}

/**
 * Per-pair (source, target) call summary over the given time window.
 * Used by the ecosystem graph to modulate edge stroke + tooltip
 * content. Edges with zero calls in the window are simply absent
 * from the result; the caller falls back to declared-edge-only
 * styling.
 */
export async function getTrafficSummaryByPair(opts: {
  since: Date;
  /** Filter to one specific source app (optional). */
  sourceAppRegistryId?: string;
  /** Filter to one specific target app (optional). */
  targetAppRegistryId?: string;
  /** Filter to one specific target label, e.g. "github". */
  targetLabel?: string;
  /** Filter to one specific source label, e.g. "training". */
  sourceLabel?: string;
}): Promise<PairTrafficSummary[]> {
  const baseWhere = {
    occurredAt: { gte: opts.since },
    ...(opts.sourceAppRegistryId ? { sourceAppRegistryId: opts.sourceAppRegistryId } : {}),
    ...(opts.targetAppRegistryId ? { targetAppRegistryId: opts.targetAppRegistryId } : {}),
    ...(opts.targetLabel ? { targetLabel: opts.targetLabel } : {}),
    ...(opts.sourceLabel ? { sourceLabel: opts.sourceLabel } : {}),
  };

  const rows = await prisma.appCallEvent.groupBy({
    by: [
      "sourceAppRegistryId",
      "targetAppRegistryId",
      "sourceLabel",
      "targetLabel",
    ],
    where: baseWhere,
    _count: { _all: true },
    _sum: { bytesIn: true, bytesOut: true },
    _max: { occurredAt: true },
  });

  // Error counts in a separate pass so we don't lose accuracy on the
  // primary aggregate. Same group-by, filtered to non-2xx.
  const errorRows = await prisma.appCallEvent.groupBy({
    by: [
      "sourceAppRegistryId",
      "targetAppRegistryId",
      "sourceLabel",
      "targetLabel",
    ],
    where: { ...baseWhere, statusCode: { gte: 400 } },
    _count: { _all: true },
  });
  const errorByKey = new Map<string, number>();
  for (const e of errorRows) {
    const key = `${e.sourceAppRegistryId ?? "_"}|${e.targetAppRegistryId ?? "_"}|${e.sourceLabel}|${e.targetLabel}`;
    errorByKey.set(key, e._count._all);
  }

  return rows.map((r) => {
    const key = `${r.sourceAppRegistryId ?? "_"}|${r.targetAppRegistryId ?? "_"}|${r.sourceLabel}|${r.targetLabel}`;
    return {
      sourceAppRegistryId: r.sourceAppRegistryId,
      targetAppRegistryId: r.targetAppRegistryId,
      sourceLabel: r.sourceLabel,
      targetLabel: r.targetLabel,
      callCount: r._count._all,
      bytesIn: r._sum.bytesIn ?? 0,
      bytesOut: r._sum.bytesOut ?? 0,
      errorCount: errorByKey.get(key) ?? 0,
      lastSeenAt: r._max.occurredAt ?? new Date(0),
    };
  });
}

export interface AppTrafficSummary {
  inbound: PairTrafficSummary[];
  outbound: PairTrafficSummary[];
}

/**
 * Inbound + outbound summary for one app over a time window. Powers
 * the per-app traffic panel.
 */
export async function getTrafficForApp(
  appRegistryId: string,
  since: Date,
): Promise<AppTrafficSummary> {
  const [inbound, outbound] = await Promise.all([
    getTrafficSummaryByPair({ since, targetAppRegistryId: appRegistryId }),
    getTrafficSummaryByPair({ since, sourceAppRegistryId: appRegistryId }),
  ]);
  return { inbound, outbound };
}

export interface CallEventRow {
  id: string;
  occurredAt: Date;
  sourceLabel: string;
  targetLabel: string;
  sourceAppRegistryId: string | null;
  targetAppRegistryId: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  bytesIn: number;
  bytesOut: number;
  durationMs: number | null;
}

/**
 * Recent raw call log. Used by /admin/ops/traffic; bounded at 500 by
 * default to keep page render fast.
 */
export async function listRecentCallEvents(opts: {
  since?: Date;
  sourceLabel?: string;
  targetLabel?: string;
  targetAppRegistryId?: string;
  sourceAppRegistryId?: string;
  endpoint?: string;
  errorsOnly?: boolean;
  take?: number;
}): Promise<CallEventRow[]> {
  const take = Math.min(opts.take ?? 250, 500);
  const rows = await prisma.appCallEvent.findMany({
    where: {
      ...(opts.since ? { occurredAt: { gte: opts.since } } : {}),
      ...(opts.sourceLabel ? { sourceLabel: opts.sourceLabel } : {}),
      ...(opts.targetLabel ? { targetLabel: opts.targetLabel } : {}),
      ...(opts.sourceAppRegistryId
        ? { sourceAppRegistryId: opts.sourceAppRegistryId }
        : {}),
      ...(opts.targetAppRegistryId
        ? { targetAppRegistryId: opts.targetAppRegistryId }
        : {}),
      ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
      ...(opts.errorsOnly ? { statusCode: { gte: 400 } } : {}),
    },
    orderBy: { occurredAt: "desc" },
    take,
  });
  return rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt,
    sourceLabel: r.sourceLabel,
    targetLabel: r.targetLabel,
    sourceAppRegistryId: r.sourceAppRegistryId,
    targetAppRegistryId: r.targetAppRegistryId,
    endpoint: r.endpoint,
    method: r.method,
    statusCode: r.statusCode,
    bytesIn: r.bytesIn,
    bytesOut: r.bytesOut,
    durationMs: r.durationMs,
  }));
}

// ───────────────────────────────────────────────────────────────────────
// Outbound helper — Slice 6.1.
// ───────────────────────────────────────────────────────────────────────

/**
 * Wrap an inbound-webhook handler so any return path (success, early
 * 4xx, thrown 5xx) records a single AppCallEvent row at the end.
 * Status comes from the NextResponse the handler returns, or 500 on
 * an uncaught throw. Bytes-in and duration are sampled at entry.
 *
 * Usage in a route file:
 *   export async function POST(request: NextRequest) {
 *     return withInboundTrafficRecording(
 *       request,
 *       { sourceLabel: "github", endpoint: "/api/webhooks/github" },
 *       async () => { ... existing handler body ... },
 *     );
 *   }
 */
import type { NextRequest, NextResponse } from "next/server";

export async function withInboundTrafficRecording(
  request: NextRequest,
  opts: {
    sourceLabel: string;
    /** Defaults to "identity-command-center" (Suite is the receiver). */
    targetLabel?: string;
    /** Route pattern, e.g. "/api/webhooks/github". */
    endpoint: string;
  },
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const startedAt = Date.now();
  const bytesIn = approxRequestBytes(request);
  let statusCode = 500;
  try {
    const resp = await handler();
    statusCode = resp.status;
    return resp;
  } finally {
    const targetId = await suiteAppRegistryId();
    void recordAppCall({
      sourceLabel: opts.sourceLabel,
      targetLabel: opts.targetLabel ?? "identity-command-center",
      sourceAppRegistryId: null,
      targetAppRegistryId: targetId,
      endpoint: opts.endpoint,
      method: request.method,
      statusCode,
      bytesIn,
      durationMs: Date.now() - startedAt,
    });
  }
}

/**
 * Record an outbound call Suite made to a third-party service. Sets
 * sourceLabel = "identity-command-center", target = the named external
 * service (e.g. "github" / "railway" / "openai"). Pre-resolves Suite's
 * AppRegistry id so the source side of the row is fully attributed.
 *
 * Use cases:
 *   - lib/integrations/github/client.ts fetchJson + createIssue
 *   - lib/integrations/railway/client.ts GraphQL fetch
 *   - lib/integrations/ai/summary-client.ts OpenAI call
 *   - lib/agents/llm.ts planner OpenAI call
 *
 * Same fire-and-forget contract as recordAppCall: never throws,
 * never blocks.
 */
export async function recordOutboundCall(input: {
  /** External service name. Lowercase, single word. */
  targetLabel: string;
  /** RPC name or path on the target. e.g. "/repos/.../hooks". */
  endpoint: string;
  method: string;
  statusCode: number;
  bytesIn?: number;
  bytesOut?: number;
  durationMs?: number;
  metadata?: Prisma.InputJsonValue | null;
}): Promise<void> {
  const sourceId = await suiteAppRegistryId();
  void recordAppCall({
    sourceAppRegistryId: sourceId,
    sourceLabel: "identity-command-center",
    targetAppRegistryId: null,
    targetLabel: input.targetLabel,
    endpoint: input.endpoint,
    method: input.method,
    statusCode: input.statusCode,
    bytesIn: input.bytesIn,
    bytesOut: input.bytesOut,
    durationMs: input.durationMs,
    metadata: input.metadata ?? null,
  });
}

// ───────────────────────────────────────────────────────────────────────
// Helpers for instrumented routes.
// ───────────────────────────────────────────────────────────────────────

/**
 * Resolve `appKey` → `AppRegistry.id` once and cache it for the
 * lifetime of the process. Used by routes that authenticate via an
 * ApiKey whose `appKey` we know but whose AppRegistry id we don't.
 */
const APP_KEY_TO_ID_CACHE = new Map<string, string | null>();

export async function appRegistryIdForKey(appKey: string | null | undefined): Promise<string | null> {
  if (!appKey) return null;
  if (APP_KEY_TO_ID_CACHE.has(appKey)) return APP_KEY_TO_ID_CACHE.get(appKey)!;
  const row = await prisma.appRegistry.findUnique({
    where: { appKey },
    select: { id: true },
  });
  const id = row?.id ?? null;
  APP_KEY_TO_ID_CACHE.set(appKey, id);
  return id;
}

/**
 * Best-effort suite app id lookup. Cached. Most call events target
 * suite, so resolving once is the common case.
 */
let SUITE_ID_CACHE: string | null = null;

export async function suiteAppRegistryId(): Promise<string | null> {
  if (SUITE_ID_CACHE) return SUITE_ID_CACHE;
  const row = await prisma.appRegistry.findUnique({
    where: { appKey: "identity-command-center" },
    select: { id: true },
  });
  SUITE_ID_CACHE = row?.id ?? null;
  return SUITE_ID_CACHE;
}

/** Approximate request body size from a NextRequest's content-length header. */
export function approxRequestBytes(req: { headers: Headers }): number {
  const len = req.headers.get("content-length");
  if (!len) return 0;
  const n = parseInt(len, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
