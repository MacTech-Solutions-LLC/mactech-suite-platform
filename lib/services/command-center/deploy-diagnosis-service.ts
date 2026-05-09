/**
 * Per-deploy crash diagnosis — Sprint 36.
 *
 * Pulls the Railway build/deploy logs for a specific
 * DeploymentSnapshot, extracts the failure summary (last error
 * lines + the build-step that died), and returns a compact
 * structured payload the live dashboard can render inline on the
 * Recently crashed cards.
 *
 * Mirrors what Railway's "Diagnose" UI does: lift the actual error
 * out of a multi-thousand-line log so an operator (or an AI) sees
 * the signal first.
 */

import { prisma } from "@/lib/db/prisma";
import { getRailwayClientForApp } from "@/lib/integrations/railway/token-routing";
import { getRailwayClient } from "@/lib/integrations/railway/client";

export interface DiagnosisLine {
  message: string;
  severity: string | null;
  timestamp: string | null;
}

export interface DeployDiagnosis {
  ok: true;
  /** The DeploymentSnapshot id we diagnosed. */
  snapshotId: string;
  /** Railway deploymentId — useful for the "open in Railway" link. */
  railwayDeploymentId: string;
  /** A short one-line description suitable for the card header. */
  headline: string;
  /** Best-guess root-cause line extracted from the log tail. Often a
   *  TypeScript / npm / build-tool error message. */
  rootCause: string | null;
  /** Last N error/warning lines, freshest last. Capped to keep the
   *  card render reasonable. */
  errorTail: DiagnosisLine[];
  /** Total number of lines pulled (for the "showing N of M" footer). */
  totalLines: number;
  /** True if the failure looks like a build-stage failure rather
   *  than a runtime crash; affects the suggested fix path. */
  isBuildFailure: boolean;
}

export type DiagnosisResult =
  | DeployDiagnosis
  | {
      ok: false;
      reason: "snapshot_not_found" | "railway_unconfigured" | "logs_unavailable";
      message?: string;
    };

const MAX_TAIL_LINES = 25;

export async function getDeploymentDiagnosis(
  snapshotId: string,
): Promise<DiagnosisResult> {
  const snap = await prisma.deploymentSnapshot.findUnique({
    where: { id: snapshotId },
    include: {
      app: { select: { appKey: true, name: true } },
      railwayResource: { select: { id: true } },
    },
  });
  if (!snap) return { ok: false, reason: "snapshot_not_found" };

  // Pick the right Railway client: per-app routing for projects that
  // need a project-token (codex, mactech-core); workspace token for
  // everything else.
  const { client } =
    snap.app && snap.app.appKey
      ? getRailwayClientForApp(snap.app.appKey)
      : { client: getRailwayClient() };

  if (!client.configured) {
    return {
      ok: false,
      reason: "railway_unconfigured",
      message:
        "Railway client isn't configured for this app — check RAILWAY_API_TOKEN and per-app routing.",
    };
  }

  const logs = await client.getDeploymentLogs(snap.railwayDeploymentId, 200);
  if (!logs.ok) {
    return {
      ok: false,
      reason: "logs_unavailable",
      message: `${logs.reason} (status ${logs.status})`,
    };
  }

  const all = logs.data;
  // Extract error/warn-ish lines for the tail. If we end up with
  // nothing flagged, fall back to the last 25 lines unfiltered —
  // that's still the "what happened right before the failure"
  // window the operator wants.
  const flagged = all.filter((l) => isErrorish(l.message, l.severity));
  const tailSource = flagged.length > 0 ? flagged : all;
  const errorTail = tailSource.slice(-MAX_TAIL_LINES);

  const rootCause = pickRootCause(errorTail);
  const isBuildFailure = looksLikeBuildFailure(all);

  return {
    ok: true,
    snapshotId: snap.id,
    railwayDeploymentId: snap.railwayDeploymentId,
    headline: rootCause ?? `${snap.railwayStatus} on ${snap.liveCommitShortSha ?? snap.railwayDeploymentId.slice(0, 8)}`,
    rootCause,
    errorTail,
    totalLines: all.length,
    isBuildFailure,
  };
}

/** Heuristic: does this line look like the kind of thing an operator
 *  would point at when asked "what failed?" */
function isErrorish(message: string, severity: string | null): boolean {
  const sev = (severity ?? "").toLowerCase();
  if (sev === "error" || sev === "err" || sev === "fatal" || sev === "warn") {
    return true;
  }
  const lc = message.toLowerCase();
  return (
    lc.includes("error") ||
    lc.includes("failed") ||
    lc.includes("✗") ||
    lc.includes("traceback") ||
    lc.includes("type error") ||
    lc.includes("cannot find") ||
    lc.includes("module not found") ||
    lc.includes("permission denied") ||
    lc.includes("did not complete successfully") ||
    lc.includes("exit code") ||
    lc.includes("npm err")
  );
}

/** Pick the most useful single line as a one-liner root-cause label.
 *  Heuristic: prefer "Type error:", "Error:", "Failed to compile",
 *  or the last error-flagged line; fall back to the last line of
 *  the tail. */
function pickRootCause(tail: DiagnosisLine[]): string | null {
  if (tail.length === 0) return null;
  const candidates = [
    /Type error:[^\n]+/i,
    /Error:[^\n]+/,
    /Failed to compile[^\n]*/i,
    /Cannot find module[^\n]+/,
    /Module not found:[^\n]+/i,
    /SyntaxError:[^\n]+/,
    /ReferenceError:[^\n]+/,
  ];
  // Walk lines newest-first; first regex hit wins.
  for (let i = tail.length - 1; i >= 0; i--) {
    const m = tail[i]!.message;
    for (const re of candidates) {
      const hit = m.match(re);
      if (hit) return hit[0].trim().slice(0, 280);
    }
  }
  // Otherwise: the last non-empty line.
  for (let i = tail.length - 1; i >= 0; i--) {
    const m = tail[i]!.message.trim();
    if (m.length > 0) return m.slice(0, 280);
  }
  return null;
}

function looksLikeBuildFailure(lines: DiagnosisLine[]): boolean {
  const text = lines.map((l) => l.message.toLowerCase()).join("\n");
  return (
    text.includes("npm run build") ||
    text.includes("build failed") ||
    text.includes("failed to compile") ||
    text.includes("nixpacks") ||
    text.includes("railpack")
  );
}
