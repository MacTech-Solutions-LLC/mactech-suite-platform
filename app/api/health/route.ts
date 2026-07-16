/**
 * GET /api/health — liveness + DB connectivity probe.
 *
 * Returns 200 with `{ ok: true, db: "ok", uptime, version }` when the
 * Postgres connection responds within the timeout. Returns 503 with a
 * structured error otherwise.
 *
 * Railway uses this for healthcheck routing — a 503 here causes Railway
 * to keep the previous deployment serving traffic instead of draining
 * to a hung instance (which would happen if e.g. `prisma migrate deploy`
 * stalls during startup or the Postgres URL becomes invalid).
 *
 * Public route — no auth required, by design. Information leaked is
 * limited to "is the DB reachable" + a short version string. No secrets.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolveBuildMetadata } from "@/lib/build-metadata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VERSION = resolveBuildMetadata().commitShortSha;
const STARTED_AT = Date.now();

export async function GET() {
  const start = Date.now();
  try {
    // Simple round-trip; bound to 2s so a stuck connection doesn't tie
    // up the healthcheck worker.
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db_timeout")), 2000),
      ),
    ]);
    return NextResponse.json(
      {
        ok: true,
        db: "ok",
        version: VERSION,
        uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
        latencyMs: Date.now() - start,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: "error",
        version: VERSION,
        uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 503 },
    );
  }
}
