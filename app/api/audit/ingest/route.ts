import { NextResponse, type NextRequest } from "next/server";
import { auditIngestSchema } from "@/lib/validations/audit";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import { requireApiKey } from "@/lib/api-auth";
import { consumeRateLimit, rate429Response } from "@/lib/rate-limit";
import {
  appRegistryIdForKey,
  approxRequestBytes,
  recordAppCall,
  suiteAppRegistryId,
} from "@/lib/services/command-center/traffic-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Audit ingest is the most-trafficked public endpoint (every sibling-app
// session opens fires one). 600/min per key = 10 events/sec sustained,
// generous enough for normal load + bursts but tight enough that a
// runaway loop in a sibling app can't flood the central audit table.
const INGEST_LIMIT = 600;
const INGEST_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const bytesIn = approxRequestBytes(request);
  // Helper closure so every early-return path emits a traffic event
  // with the correct status + bytes attribution.
  const recordTraffic = async (statusCode: number, sourceLabel: string) => {
    const [sourceId, targetId] = await Promise.all([
      appRegistryIdForKey(sourceLabel),
      suiteAppRegistryId(),
    ]);
    void recordAppCall({
      sourceLabel,
      sourceAppRegistryId: sourceId,
      targetAppRegistryId: targetId,
      endpoint: "/api/audit/ingest",
      method: "POST",
      statusCode,
      bytesIn,
      durationMs: Date.now() - startedAt,
    });
  };

  const auth = await requireApiKey(request, "audit_ingest");
  if (!auth.ok) {
    void recordTraffic(401, "anonymous");
    return auth.response;
  }
  // Caller appKey resolved from the issued ApiKey row when possible.
  const sourceLabel = auth.apiKeyApp ?? auth.apiKeyName ?? "anonymous";

  const rl = consumeRateLimit({
    key: `ingest:${auth.apiKeyId ?? auth.apiKeyName}`,
    limit: INGEST_LIMIT,
    windowMs: INGEST_WINDOW_MS,
  });
  if (!rl.allowed) {
    void recordTraffic(429, sourceLabel);
    return rate429Response(rl);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    void recordTraffic(400, sourceLabel);
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = auditIngestSchema.safeParse(body);
  if (!parsed.success) {
    void recordTraffic(400, sourceLabel);
    return NextResponse.json(
      {
        error: "Validation failed.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const app = await prisma.appRegistry.findUnique({ where: { appKey: input.appKey } });
  if (!app) {
    void recordTraffic(404, sourceLabel);
    return NextResponse.json(
      { error: `Unknown appKey: ${input.appKey}` },
      { status: 404 },
    );
  }

  let customerOrganizationId = input.customerOrgId ?? null;
  if (!customerOrganizationId && input.customerOrgClerkId) {
    const org = await prisma.customerOrganization.findUnique({
      where: { clerkOrgId: input.customerOrgClerkId },
      select: { id: true },
    });
    customerOrganizationId = org?.id ?? null;
  }

  let actorUserProfileId: string | null = null;
  if (input.actorClerkUserId) {
    const profile = await prisma.userProfile.findUnique({
      where: { clerkUserId: input.actorClerkUserId },
      select: { id: true },
    });
    actorUserProfileId = profile?.id ?? null;
  }

  const log = await writeAuditLog({
    eventType: input.eventType,
    eventCategory: input.eventCategory,
    severity: input.severity,
    action: input.action,
    actorClerkUserId: input.actorClerkUserId ?? null,
    actorEmail: input.actorEmail ?? null,
    actorUserProfileId,
    customerOrganizationId,
    appRegistryId: app.id,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    requestId: input.requestId ?? null,
    ipAddress: getIp(request),
    userAgent: request.headers.get("user-agent"),
    metadata:
      input.metadata != null
        ? (input.metadata as unknown as import("@prisma/client").Prisma.InputJsonValue)
        : null,
  });

  // The body's appKey is the canonical source for traffic attribution
  // (the issued ApiKey may be tagged with a different appKey in older
  // configs; the body wins for app-to-app accounting).
  void recordTraffic(201, input.appKey);

  return NextResponse.json({ ok: true, id: log.id }, { status: 201 });
}

function getIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
