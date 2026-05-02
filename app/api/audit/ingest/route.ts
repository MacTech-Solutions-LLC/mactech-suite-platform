import { NextResponse, type NextRequest } from "next/server";
import { auditIngestSchema } from "@/lib/validations/audit";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import { requireApiKey } from "@/lib/api-auth";
import { consumeRateLimit, rate429Response } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Audit ingest is the most-trafficked public endpoint (every sibling-app
// session opens fires one). 600/min per key = 10 events/sec sustained,
// generous enough for normal load + bursts but tight enough that a
// runaway loop in a sibling app can't flood the central audit table.
const INGEST_LIMIT = 600;
const INGEST_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const auth = await requireApiKey(request, "audit_ingest");
  if (!auth.ok) return auth.response;

  const rl = consumeRateLimit({
    key: `ingest:${auth.apiKeyId ?? auth.apiKeyName}`,
    limit: INGEST_LIMIT,
    windowMs: INGEST_WINDOW_MS,
  });
  if (!rl.allowed) return rate429Response(rl);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = auditIngestSchema.safeParse(body);
  if (!parsed.success) {
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

  return NextResponse.json({ ok: true, id: log.id }, { status: 201 });
}

function getIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
