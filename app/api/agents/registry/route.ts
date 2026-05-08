/**
 * GET /api/agents/registry
 *
 * Returns the user-facing surface the IntentBuilder needs to render
 * scope chips and invariant checkboxes:
 *   - apps:         { id, appKey, name }[]
 *   - repos:        { id, fullName }[]
 *   - capabilities: { key, kind, label, description, requiredInputs }[]
 *   - invariants:   { capabilityKey, key, label, description, defaultOn }[]
 *
 * Permission: platform:agents:view (auditors should see what an
 * IntentBuilder can build — they cannot create a plan, but they need
 * the catalog to read existing runs intelligibly).
 */

import { NextResponse } from "next/server";
import { AuthorizationError, requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { listCapabilities } from "@/lib/agents/capabilities/registry";
import { listAllInvariants } from "@/lib/agents/intent/invariants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_VIEW);
    const [apps, repos] = await Promise.all([
      prisma.appRegistry.findMany({
        where: { status: "active" },
        select: { id: true, appKey: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.gitRepository.findMany({
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
    ]);
    const capabilities = listCapabilities().map((c) => ({
      key: c.key,
      kind: c.kind,
      label: c.label,
      description: c.description,
      requiredInputs: c.inputSchema.required,
      optionalInputs: c.inputSchema.optional ?? [],
    }));
    const invariants = listAllInvariants().map((i) => ({
      capabilityKey: i.capabilityKey,
      key: i.key,
      label: i.label,
      description: i.description,
      defaultOn: i.defaultOn,
    }));
    return NextResponse.json({ ok: true, apps, repos, capabilities, invariants });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      const status = err.code === "unauthenticated" ? 401 : 403;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    return NextResponse.json({ ok: false, error: "registry_failed" }, { status: 500 });
  }
}
