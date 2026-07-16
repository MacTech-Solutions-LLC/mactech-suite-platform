import { PageHeader } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { initialsFor, relativeTime } from "@/lib/utils";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Team — the Suite's view of member capability profiles (ADR-0003).
 *
 * A member fills this in once in GovCon Ops (bizops) from a resume they confirm
 * field by field; bizops writes it here, and every entitled app reads it. This
 * page is the Hub looking at what it holds — the same records CaptureOS pulls
 * onto founder cards, shown against the identities the Hub owns.
 *
 * NAICS is shown as bare codes: the Hub stores codes only, never titles, so a
 * revision can't strand a stale title in three databases. The consuming apps
 * (bizops, CaptureOS) look titles up locally against their own tables.
 */
export default async function TeamPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.DASHBOARD_VIEW);

  const profiles = await prisma.memberCapabilityProfile.findMany({
    include: {
      userProfile: {
        select: { firstName: true, lastName: true, email: true, clerkUserId: true },
      },
      naics: { orderBy: { rank: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const nameFor = (u: { firstName: string | null; lastName: string | null; email: string }) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Member capability profiles built in GovCon Ops and shared across the suite. Read-only here — profiles are edited where a member confirms them."
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Headline</TableHead>
                <TableHead>Labor category</TableHead>
                <TableHead className="text-right">Years</TableHead>
                <TableHead>NAICS</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.length === 0 ? (
                <TableEmpty
                  colSpan={7}
                  message="No capability profiles yet. They appear here once a member completes onboarding in GovCon Ops."
                />
              ) : (
                profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                          {initialsFor(nameFor(p.userProfile))}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {nameFor(p.userProfile)}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {p.userProfile.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="line-clamp-2 text-sm">{p.headline ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-sm">{p.laborCategory ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {p.yearsExperience ?? "—"}
                    </TableCell>
                    <TableCell>
                      {p.naics.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {p.naics.map((n) => (
                            <span
                              key={n.code}
                              className="rounded-sm border border-border bg-muted/40 px-1.5 py-px font-mono text-[10px]"
                            >
                              {n.code}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.sourceAppKey ? (
                        <Badge variant="secondary">{p.sourceAppKey}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {relativeTime(p.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
