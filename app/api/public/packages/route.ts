/**
 * Public, read-only catalog endpoint.
 *
 * Returns every Package with status="active". No auth — this is the
 * source-of-truth catalog the marketing site (and any future surface)
 * reads from. Sensitive fields (entitlementTier, includedAppKeys) are
 * included because the marketing site needs them to render copy like
 * "includes Capture + Codex + Vault."
 *
 * Pricing is returned in BOTH `priceCents` (canonical integer) and
 * `priceFormatted` (USD-formatted for direct UI rendering). Currency
 * comes from the package row.
 *
 * Cache: 60s public CDN cache, 5min stale-while-revalidate. The catalog
 * is admin-edited rarely; flushing more often would just hit our DB.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const packages = await prisma.package.findMany({
    where: { status: "active" },
    orderBy: [{ billingCycle: "asc" }, { priceCents: "asc" }],
  });

  const data = packages.map((pkg) => ({
    sku: pkg.sku,
    name: pkg.name,
    description: pkg.description,
    priceCents: pkg.priceCents,
    currency: pkg.currency,
    priceFormatted: formatPrice(pkg.priceCents, pkg.currency),
    billingCycle: pkg.billingCycle,
    entitlementTier: pkg.entitlementTier,
    includedAppKeys: pkg.includedAppKeys,
  }));

  return NextResponse.json(
    { packages: data },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
