import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomerOrgTable } from "@/components/tables/customer-org-table";
import { CreateCustomerOrgForm } from "@/components/forms/create-customer-org-form";
import { Pagination, buildHrefForPage } from "@/components/ui/pagination";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "onboarding", "suspended", "archived"] as const;
const TIERS = ["starter", "professional", "enterprise", "federal"] as const;
const LEVELS = ["level1", "level2", "unknown"] as const;
const TYPES = ["dib", "prime", "subcontractor", "internal", "other"] as const;

export default async function CustomerOrgsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.DASHBOARD_VIEW);

  const q = readParam(searchParams, "q");
  const status = readParam(searchParams, "status");
  const tier = readParam(searchParams, "tier");
  const level = readParam(searchParams, "level");
  const type = readParam(searchParams, "type");

  const where: Prisma.CustomerOrganizationWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { domain: { contains: q, mode: "insensitive" } },
      { cageCode: { contains: q, mode: "insensitive" } },
      { uei: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }
  if (status && (STATUSES as readonly string[]).includes(status)) {
    where.status = status as (typeof STATUSES)[number];
  }
  if (tier && (TIERS as readonly string[]).includes(tier)) {
    where.subscriptionTier = tier as (typeof TIERS)[number];
  }
  if (level && (LEVELS as readonly string[]).includes(level)) {
    where.cmmcTargetLevel = level as (typeof LEVELS)[number];
  }
  if (type && (TYPES as readonly string[]).includes(type)) {
    where.customerType = type as (typeof TYPES)[number];
  }

  const PAGE_SIZE = 50;
  const page = Math.max(1, Number(readParam(searchParams, "page") ?? "1") || 1);

  const [orgs, total, apps] = await Promise.all([
    prisma.customerOrganization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        entitlements: { where: { enabled: true }, select: { id: true } },
        orgUserAccess: { select: { id: true } },
      },
    }),
    prisma.customerOrganization.count({ where }),
    prisma.appRegistry.findMany({
      where: { status: "active", isInternalOnly: false },
      select: { id: true, appKey: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    subscriptionTier: org.subscriptionTier,
    cmmcTargetLevel: org.cmmcTargetLevel,
    customerType: org.customerType,
    domain: org.domain,
    cageCode: org.cageCode,
    enabledApps: org.entitlements.length,
    totalUsers: org.orgUserAccess.length,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer organizations"
        description="MacTech customer tenants with their subscription, compliance posture, and product access."
        actions={<CreateCustomerOrgForm apps={apps} />}
      />

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 md:grid-cols-6" method="get">
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="q">Search</Label>
              <Input
                id="q"
                name="q"
                placeholder="Name, domain, CAGE, UEI"
                defaultValue={q ?? ""}
              />
            </div>
            <FilterSelect
              id="status"
              label="Status"
              defaultValue={status ?? "any"}
              options={["any", ...STATUSES]}
            />
            <FilterSelect
              id="tier"
              label="Tier"
              defaultValue={tier ?? "any"}
              options={["any", ...TIERS]}
            />
            <FilterSelect
              id="level"
              label="CMMC"
              defaultValue={level ?? "any"}
              options={["any", ...LEVELS]}
            />
            <FilterSelect
              id="type"
              label="Type"
              defaultValue={type ?? "any"}
              options={["any", ...TYPES]}
            />
            <div className="md:col-span-6 flex justify-end">
              <button
                type="submit"
                className="text-xs underline-offset-2 hover:underline text-muted-foreground"
              >
                Apply filters
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <CustomerOrgTable rows={rows} />
        </CardContent>
      </Card>

      <Pagination
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        hrefForPage={(p) => buildHrefForPage("/admin/customer-orgs", searchParams, p)}
      />
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
  options: readonly string[];
  defaultValue: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select name={id} defaultValue={defaultValue}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
