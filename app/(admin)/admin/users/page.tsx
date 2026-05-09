import Link from "next/link";
import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { PlatformUserActions } from "@/components/forms/platform-user-actions";
import { initialsFor, relativeTime } from "@/lib/utils";
import { Pagination, buildHrefForPage } from "@/components/ui/pagination";
import { prisma } from "@/lib/db/prisma";
import {
  requirePlatformPermission,
  getCurrentAuthContext,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS, platformRoleLabel } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function AllUsersPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.DASHBOARD_VIEW);
  const ctx = await getCurrentAuthContext();
  const selfId = ctx?.userProfile.id;
  const canManage = Boolean(
    ctx?.permissions.includes("platform:mactech_users:manage"),
  );

  const q =
    typeof searchParams?.q === "string" && searchParams.q.length > 0
      ? searchParams.q
      : null;

  const where: Prisma.UserProfileWhereInput = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
    ];
  }

  const PAGE_SIZE = 50;
  const pageRaw = searchParams?.page;
  const page = Math.max(1, Number(typeof pageRaw === "string" ? pageRaw : "1") || 1);

  const [users, total, allOrgs] = await Promise.all([
    prisma.userProfile.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { orgAccess: { include: { customerOrganization: true } } },
    }),
    prisma.userProfile.count({ where }),
    prisma.customerOrganization.findMany({
      where: { status: { in: ["active", "onboarding"] } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Every UserProfile in the system, both internal MacTech admins and customer users. Use the row menu to grant or revoke platform access."
      />

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 md:grid-cols-3" method="get">
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="q">Search</Label>
              <Input
                id="q"
                name="q"
                placeholder="Name or email"
                defaultValue={q ?? ""}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="text-xs underline-offset-2 hover:underline text-muted-foreground"
              >
                Apply
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Affiliation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="w-12 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableEmpty colSpan={5} message="No users match." />
              ) : (
                users.map((u) => {
                  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <Link
                          href={`/admin/audit-logs?actorEmail=${encodeURIComponent(
                            u.email,
                          )}`}
                          className="group flex items-center gap-3"
                          aria-label={`Follow ${u.email} in audit logs`}
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                            {initialsFor(fullName, u.email)}
                          </div>
                          <div>
                            <div className="text-sm font-medium group-hover:text-primary">
                              {fullName || u.email}
                              {u.id === selfId && (
                                <Badge variant="outline" className="ml-2 text-[10px]">
                                  you
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {u.email}
                            </div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {u.isInternalMacTechUser ? (
                          <Badge variant="default">{platformRoleLabel(u.platformRole)}</Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {u.orgAccess.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                No org affiliation
                              </span>
                            )}
                            {u.orgAccess.slice(0, 3).map((a) => (
                              <Link
                                key={a.id}
                                href={`/admin/customer-orgs/${a.customerOrganization.id}`}
                                className="hover:underline"
                              >
                                <Badge variant="muted">
                                  {a.customerOrganization.name} · {a.role}
                                </Badge>
                              </Link>
                            ))}
                            {u.orgAccess.length > 3 && (
                              <Badge variant="outline">+{u.orgAccess.length - 3}</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={u.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {relativeTime(u.lastSeenAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <PlatformUserActions
                            userProfileId={u.id}
                            email={u.email}
                            isSelf={u.id === selfId}
                            currentRole={u.platformRole}
                            currentStatus={u.status}
                            allOrgs={allOrgs}
                            memberships={u.orgAccess.map((a) => ({
                              id: a.id,
                              customerOrganizationId: a.customerOrganization.id,
                              customerOrganizationName:
                                a.customerOrganization.name,
                              customerOrganizationSlug:
                                a.customerOrganization.slug,
                              role: a.role,
                              status: a.status,
                            }))}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        hrefForPage={(p) => buildHrefForPage("/admin/users", searchParams, p)}
      />
    </div>
  );
}
