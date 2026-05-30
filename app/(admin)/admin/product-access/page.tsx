/**
 * /admin/product-access — entitlement matrix.
 *
 * Slice 1 surface; Sprint 51 Vivid pass.
 *
 * Click any cell to instantly toggle whether that customer org has
 * access to that app. Every change is audited, mirrored to Clerk
 * publicMetadata, and dispatched to webhook subscribers.
 */

import Link from "next/link";
import { Filter } from "lucide-react";
import { MatrixCellToggle } from "@/components/forms/matrix-cell-toggle";
import { VividCard } from "@/components/vivid/vivid-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "onboarding", "suspended", "inactive", "unpaid", "archived"] as const;
const TIERS = ["starter", "professional", "enterprise", "federal"] as const;

const TIER_TONE: Record<string, string> = {
  starter: "border-mt-violet/30 bg-mt-violet/10 text-mt-violet",
  professional: "border-mt-cyan/30 bg-mt-cyan/10 text-mt-cyan",
  enterprise: "border-mt-amber/30 bg-mt-amber/10 text-mt-amber",
  federal: "border-mt-magenta/30 bg-mt-magenta/10 text-mt-magenta",
};

export default async function ProductAccessPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.ENTITLEMENTS_MANAGE);

  const q = readParam(searchParams, "q");
  const status = readParam(searchParams, "status");
  const tier = readParam(searchParams, "tier");
  const appKey = readParam(searchParams, "appKey");

  const where: Prisma.CustomerOrganizationWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { domain: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }
  if (status && (STATUSES as readonly string[]).includes(status)) {
    where.status = status as (typeof STATUSES)[number];
  }
  if (tier && (TIERS as readonly string[]).includes(tier)) {
    where.subscriptionTier = tier as (typeof TIERS)[number];
  }

  const [orgs, allApps] = await Promise.all([
    prisma.customerOrganization.findMany({
      // Internal MacTech orgs aren't gated by entitlements; operators
      // get every app via UserProfile.isInternalMacTechUser.
      where: { ...where, isInternalMacTech: false },
      orderBy: { name: "asc" },
      include: { entitlements: true },
    }),
    prisma.appRegistry.findMany({
      where: { isInternalOnly: false },
      orderBy: { name: "asc" },
    }),
  ]);

  const apps = appKey ? allApps.filter((a) => a.appKey === appKey) : allApps;

  const enabledCount = orgs.reduce(
    (acc, org) => acc + org.entitlements.filter((e) => e.enabled).length,
    0,
  );
  const totalCells = orgs.length * apps.length;

  return (
    <div className="space-y-6">
      {/* Vivid hero */}
      <header className="relative">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
              MacTech Suite · Customer entitlements
            </div>
            <h1 className="mt-2 font-mt-display text-3xl font-semibold leading-tight tracking-tight text-mt-text md:text-4xl">
              Product access matrix
            </h1>
            <p className="mt-1 max-w-2xl text-pretty text-sm text-mt-text-2">
              Click any cell to toggle whether that customer org has access to
              that app. Every change is audited, mirrored to Clerk{" "}
              <code className="font-mt-mono text-xs">publicMetadata</code>, and
              dispatched to webhook subscribers.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-right md:gap-3">
            <Counter label="Orgs" value={orgs.length} tone="cyan" />
            <Counter label="Apps" value={apps.length} tone="violet" />
            <Counter
              label="Enabled"
              value={enabledCount}
              sub={totalCells > 0 ? `${pct(enabledCount, totalCells)}% of cells` : undefined}
              tone="lime"
            />
          </div>
        </div>

        <div
          aria-hidden
          className="mt-6 h-px w-full"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.45) 18%, rgba(124,92,255,0.45) 50%, rgba(255,91,208,0.45) 82%, transparent 100%)",
          }}
        />
      </header>

      {/* Filters */}
      <VividCard>
        <div className="mb-3 flex items-center gap-2 font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
          <Filter className="h-3 w-3" aria-hidden />
          Filters
        </div>
        <form className="grid gap-3 md:grid-cols-5" method="get">
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="q" className="text-xs text-mt-text-2">
              Search organizations
            </Label>
            <Input
              id="q"
              name="q"
              placeholder="Name, domain, slug"
              defaultValue={q ?? ""}
              className="border-mt-hairline bg-mt-surface-1 text-mt-text placeholder:text-mt-text-4 focus-visible:ring-mt-cyan"
            />
          </div>
          <FilterSelect
            id="status"
            label="Status"
            defaultValue={status ?? "any"}
            options={[
              { value: "any", label: "any" },
              ...STATUSES.map((s) => ({ value: s, label: s })),
            ]}
          />
          <FilterSelect
            id="tier"
            label="Tier"
            defaultValue={tier ?? "any"}
            options={[
              { value: "any", label: "any" },
              ...TIERS.map((t) => ({ value: t, label: t })),
            ]}
          />
          <FilterSelect
            id="appKey"
            label="Focus on app"
            defaultValue={appKey ?? "any"}
            options={[
              { value: "any", label: "all apps" },
              ...allApps.map((a) => ({ value: a.appKey, label: a.name })),
            ]}
          />
          <div className="flex items-center justify-end gap-3 md:col-span-5">
            <Link
              href="/admin/product-access"
              className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3 hover:text-mt-text-2"
            >
              Reset
            </Link>
            <button
              type="submit"
              className="rounded-mt-2 border border-mt-cyan/30 bg-mt-cyan/10 px-3 py-1.5 font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-cyan hover:bg-mt-cyan/15"
            >
              Apply filters
            </button>
          </div>
        </form>
      </VividCard>

      {/* Matrix card */}
      <VividCard bare className="overflow-hidden p-0">
        <div className="border-b border-mt-hairline px-5 py-4">
          <div className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
            Matrix
          </div>
          <h2 className="mt-1 font-mt-display text-base font-semibold tracking-tight text-mt-text md:text-lg">
            {orgs.length.toLocaleString()}{" "}
            {orgs.length === 1 ? "organization" : "organizations"} ×{" "}
            {apps.length.toLocaleString()} {apps.length === 1 ? "app" : "apps"}
          </h2>
          <p className="mt-1 text-xs text-mt-text-3">
            Green cells = enabled. Click to toggle. New entitlements default to{" "}
            <code className="rounded-mt-1 bg-mt-surface-2 px-1 py-0.5 font-mt-mono">
              plan=starter
            </code>
            ; previously-set plans + seat caps + expirations are preserved.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-mt-hairline">
                <th
                  className="sticky left-0 z-20 min-w-[18rem] bg-mt-bg-2 px-4 py-3 text-left font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3 backdrop-blur-mt-glass"
                  scope="col"
                >
                  Customer organization
                </th>
                {apps.map((app) => (
                  <th
                    key={app.id}
                    scope="col"
                    className="min-w-[8rem] px-2 py-3 text-center"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-mt-display text-xs font-semibold text-mt-text">
                        {app.name}
                      </span>
                      <span className="font-mt-mono text-[9px] uppercase tracking-[0.16em] text-mt-text-4">
                        {app.appKey}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgs.length === 0 ? (
                <tr>
                  <td
                    colSpan={apps.length + 1}
                    className="px-6 py-12 text-center font-mt-mono text-[11px] uppercase tracking-[0.18em] text-mt-text-3"
                  >
                    No customer organizations match these filters.
                  </td>
                </tr>
              ) : (
                orgs.map((org, i) => (
                  <tr
                    key={org.id}
                    className={
                      i % 2 === 0
                        ? "border-t border-mt-hairline bg-mt-surface-1/50 hover:bg-mt-surface-2/60"
                        : "border-t border-mt-hairline hover:bg-mt-surface-2/60"
                    }
                  >
                    <td
                      className="sticky left-0 z-10 min-w-[18rem] bg-mt-bg-2 px-4 py-3 backdrop-blur-mt-glass"
                      scope="row"
                    >
                      <Link
                        href={`/admin/customer-orgs/${org.id}/entitlements`}
                        className="font-mt-display text-sm font-medium text-mt-text hover:text-mt-cyan"
                      >
                        {org.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-mt-1 border px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] ${TIER_TONE[org.subscriptionTier] ?? "border-mt-hairline bg-mt-surface-1 text-mt-text-3"}`}
                        >
                          {org.subscriptionTier}
                        </span>
                        <span className="inline-flex items-center rounded-mt-1 border border-mt-hairline bg-mt-surface-1 px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] text-mt-text-3">
                          CMMC {org.cmmcTargetLevel}
                        </span>
                        <span className="font-mt-mono text-[9px] uppercase tracking-[0.16em] text-mt-text-4">
                          · {org.status}
                        </span>
                      </div>
                    </td>
                    {apps.map((app) => {
                      const entitlement = org.entitlements.find(
                        (e) => e.appRegistryId === app.id,
                      );
                      return (
                        <td key={app.id} className="px-2 py-2 text-center">
                          <MatrixCellToggle
                            customerOrganizationId={org.id}
                            appRegistryId={app.id}
                            customerOrgName={org.name}
                            appName={app.name}
                            appKey={app.appKey}
                            initialEnabled={entitlement?.enabled ?? false}
                            initialPlan={entitlement?.plan ?? null}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </VividCard>
    </div>
  );
}

function Counter({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: "cyan" | "violet" | "lime";
}) {
  const color =
    tone === "cyan" ? "#00E5FF" : tone === "violet" ? "#7C5CFF" : "#B6FF6E";
  return (
    <div className="rounded-mt-2 border border-mt-hairline bg-mt-surface-1 px-3 py-2 backdrop-blur-mt-glass">
      <div className="font-mt-mono text-[9px] uppercase tracking-[0.18em] text-mt-text-3">
        {label}
      </div>
      <div
        className="mt-0.5 font-mt-display text-xl font-semibold tabular-nums"
        style={{ color }}
      >
        {value.toLocaleString()}
      </div>
      {sub ? (
        <div className="font-mt-mono text-[9px] uppercase tracking-[0.16em] text-mt-text-4">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function readParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | null {
  if (!searchParams) return null;
  const v = searchParams[key];
  if (typeof v === "string" && v.length > 0 && v !== "any") return v;
  return null;
}

function FilterSelect({
  id,
  label,
  options,
  defaultValue,
}: {
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-mt-text-2">
        {label}
      </Label>
      <Select name={id} defaultValue={defaultValue}>
        <SelectTrigger className="border-mt-hairline bg-mt-surface-1 text-mt-text focus:ring-mt-cyan">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function pct(numer: number, denom: number): number {
  if (denom === 0) return 0;
  return Math.round((numer / denom) * 100);
}
