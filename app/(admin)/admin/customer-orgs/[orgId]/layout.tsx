import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerOrgTabs } from "./tabs";
import { CustomerOrgActions } from "@/components/forms/customer-org-actions";
import { ClerkLinkageCard } from "@/components/cards/clerk-linkage-card";
import { ReconcileClerkButton } from "@/components/forms/reconcile-clerk-button";

export const dynamic = "force-dynamic";

export default async function CustomerOrgDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { orgId: string };
}) {
  const org = await prisma.customerOrganization.findUnique({
    where: { id: params.orgId },
  });
  if (!org) notFound();

  // The internal MacTech org has its own dedicated surface at
  // /admin/mactech-users. Sending operators there avoids two divergent
  // edit paths and keeps "this is us, not a customer" unambiguous.
  if (org.isInternalMacTech) {
    redirect("/admin/mactech-users");
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
          <Link href="/admin/customer-orgs">
            <ArrowLeft className="h-4 w-4" /> All customer organizations
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
            <StatusBadge status={org.status} />
            <Badge variant="outline">{org.subscriptionTier}</Badge>
            <Badge variant="muted">CMMC {org.cmmcTargetLevel}</Badge>
            <Badge variant="muted">{org.customerType}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {org.legalName || org.domain || `/${org.slug}`}
            {org.cageCode && ` · CAGE ${org.cageCode}`}
            {org.uei && ` · UEI ${org.uei}`}
            {org.clerkOrgId && ` · Clerk ${org.clerkOrgId.slice(0, 14)}…`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {org.clerkOrgId ? (
            <ReconcileClerkButton
              customerOrganizationId={org.id}
              variant="outline"
              size="sm"
            />
          ) : null}
          <CustomerOrgActions org={org} />
        </div>
      </div>

      <ClerkLinkageCard
        orgId={org.id}
        clerkOrgId={org.clerkOrgId}
        imageUrl={org.imageUrl}
        name={org.name}
      />

      <CustomerOrgTabs orgId={org.id} />

      {children}
    </div>
  );
}
