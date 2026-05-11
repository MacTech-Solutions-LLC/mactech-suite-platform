/**
 * Sprint 54 — drift audit CSV download endpoint.
 * Reuses the runDriftAudit server-action wrapper for the actual scan
 * + audit-log write; this route just streams the CSV back as a file
 * download.
 */

import { NextResponse } from "next/server";
import { runDriftAudit } from "../_actions/drift-audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const { csv } = await runDriftAudit();
  const filename = `mactech-drift-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
