import Link from "next/link";
import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { PlatformUserActions } from "@/components/forms/platform-user-actions";
import { InviteMacTechAdminButton } from "@/components/forms/invite-mactech-admin-button";
import { ReconcileClerkButton } from "@/components/forms/reconcile-clerk-button";
import { CustomerOrgActions } from "@/components/forms/customer-org-actions";
import { initialsFor, relativeTime } from "@/lib/utils";
import { prisma } from "@/lib/db/prisma";
import {
  requirePlatformPermission,
  getCurrentAuthContext,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS, platformRoleLabel } from "@/lib/permissions";
import { ShieldCheck, AlertTriangle, ScrollText, Settings2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MacTechUsersPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.MACTECH_USERS_MANAGE);
  const ctx = await getCurrentAuthContext();
  const selfId = ctx?.userProfile.id;

  const [profiles, allOrgs, internalOrg] = await Promise.all([
    prisma.userProfile.findMany({
      where: { isInternalMacTechUser: true },
      orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }],
      include: { orgAccess: { include: { customerOrganization: true } } },
    }),
    prisma.customerOrganization.findMany({
      where: { status: { in: ["active", "onboarding"] } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    prisma.customerOrganization.findFirst({
      where: { isInternalMacTech: true },
    }),
  ]);

  const internalOrgMemberCount = internalOrg
    ? await prisma.orgUserAccess.count({
        where: { customerOrganizationId: internalOrg.id },
      })
    : 0;

  const canInvite = Boolean(internalOrg?.clerkOrgId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="MacTech Admins"
        description="Internal MacTech employees with platform-level authority across the suite."
        actions={canInvite ? <InviteMacTechAdminButton /> : null}
      />

      {/* Internal-org identity card — visually distinct from customer orgs.
          Cyan ring + shield mark establish "this is us, not a customer."
          Exposes the same actions (edit, audit, sync) the customer-org
          detail page would, so operators don't need to leave this page. */}
      {internalOrg ? (
        <Card className="border-primary/40 ring-1 ring-primary/20">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      {internalOrg.name}
                    </span>
                    <Badge variant="default" className="text-[10px]">
                      Internal · MacTech
                    </Badge>
                    <StatusBadge status={internalOrg.status} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-mono">
                    <span>/{internalOrg.slug}</span>
                    {internalOrg.clerkOrgId ? (
                      <span title="Clerk organization ID">
                        clerk:{internalOrg.clerkOrgId.slice(0, 18)}…
                      </span>
                    ) : (
                      <span className="text-warning">no Clerk org linked</span>
                    )}
                    {internalOrg.domain ? <span>@{internalOrg.domain}</span> : null}
                    <span>
                      {internalOrgMemberCount} member
                      {internalOrgMemberCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                {internalOrg.clerkOrgId ? (
                  <ReconcileClerkButton
                    customerOrganizationId={internalOrg.id}
                    variant="outline"
                    size="sm"
                  />
                ) : null}
                <CustomerOrgActions org={internalOrg} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs">
              <Link
                href={`/admin/audit-logs?orgId=${internalOrg.id}`}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <ScrollText className="h-3.5 w-3.5" /> Audit trail
              </Link>
              <Link
                href={`/admin/customer-orgs/${internalOrg.id}/entitlements`}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                title="Entitlements are informational for the internal org — operators inherit access via isInternalMacTechUser"
              >
                <Settings2 className="h-3.5 w-3.5" /> Entitlements
              </Link>
              <span className="ml-auto text-muted-foreground">
                The single source of truth for the MacTech operator plane.
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-destructive/40 ring-1 ring-destructive/20">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="space-y-1 text-sm">
              <div className="font-semibold text-destructive">
                No internal MacTech organization configured
              </div>
              <p className="text-muted-foreground">
                Mark one CustomerOrganization row with{" "}
                <span className="font-mono">isInternalMacTech=true</span> so the
                operator plane has a home org. Until then, invites here will
                fail.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Platform role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="w-12 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.length === 0 ? (
                <TableEmpty colSpan={5} message="No MacTech admins yet." />
              ) : (
                profiles.map((p) => {
                  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ");
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          href={`/admin/audit-logs?actorEmail=${encodeURIComponent(
                            p.email,
                          )}`}
                          className="group flex items-center gap-3"
                          aria-label={`Follow ${p.email} in audit logs`}
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                            {initialsFor(fullName, p.email)}
                          </div>
                          <div>
                            <div className="text-sm font-medium group-hover:text-primary">
                              {fullName || p.email}
                              {p.id === selfId && (
                                <Badge variant="outline" className="ml-2 text-[10px]">
                                  you
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {p.email}
                            </div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">
                          {platformRoleLabel(p.platformRole)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {relativeTime(p.lastSeenAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <PlatformUserActions
                          userProfileId={p.id}
                          email={p.email}
                          isSelf={p.id === selfId}
                          currentRole={p.platformRole}
                          currentStatus={p.status}
                          allOrgs={allOrgs}
                          memberships={p.orgAccess.map((a) => ({
                            id: a.id,
                            customerOrganizationId: a.customerOrganization.id,
                            customerOrganizationName: a.customerOrganization.name,
                            customerOrganizationSlug: a.customerOrganization.slug,
                            role: a.role,
                            status: a.status,
                          }))}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
