import { NextResponse, type NextRequest } from "next/server";
import { POST as canonicalAuditPost } from "@/app/api/hub/audit/events/route";
import {
  appRegistryIdForKey,
  approxRequestBytes,
  recordAppCall,
  suiteAppRegistryId,
} from "@/lib/services/command-center/traffic-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Compatibility shim. The canonical Suite audit ingress is now
// /api/hub/audit/events; older clients may continue posting here while they
// migrate. This route records traffic attribution and then delegates to the
// canonical Hub audit append path.
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const bytesIn = approxRequestBytes(request);
  const cloned = request.clone();
  let sourceLabel = request.headers.get("x-mactech-source-app") ?? "unknown";
  try {
    const body = await cloned.json();
    if (body && typeof body === "object") {
      sourceLabel =
        (body as { sourceAppKey?: string; appKey?: string }).sourceAppKey ??
        (body as { sourceAppKey?: string; appKey?: string }).appKey ??
        sourceLabel;
    }
  } catch {
    // The canonical route returns the validation error; traffic still records.
  }

  const response = await canonicalAuditPost(request);
  void recordTraffic(response.status, sourceLabel, bytesIn, Date.now() - startedAt);
  return response;
}

async function recordTraffic(
  statusCode: number,
  sourceLabel: string,
  bytesIn: number,
  durationMs: number,
) {
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
    durationMs,
  });
}
