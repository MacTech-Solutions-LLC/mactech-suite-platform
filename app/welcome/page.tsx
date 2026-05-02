/**
 * /welcome — post-sign-in smart router.
 *
 * Behavior:
 *   - No session → /sign-in
 *   - No UserProfile → /access-restricted?reason=no_profile
 *   - Internal MacTech operator → /dashboard (the admin shell)
 *   - Customer user with exactly 1 enabled app across active orgs →
 *     auto-redirect to /app-launch/{appKey}?orgId=...
 *   - Customer user with multiple → render a "pick where to start"
 *     picker grouped by org
 *   - Customer user with zero enabled apps → friendly empty state
 *     pointing at the org's primary contact
 *
 * Set as the Clerk after-sign-in / after-sign-up URL so every entry
 * point routes through here.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import {
  Hexagon,
  ArrowRight,
  Building2,
  AlertCircle,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAuthContext } from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initialsFor } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const session = await auth();
  if (!session.userId) {
    redirect("/sign-in?redirect_url=/welcome");
  }
  const ctx = await getCurrentAuthContext();
  if (!ctx) {
    redirect("/access-restricted?reason=no_profile");
  }
  if (ctx.userProfile.status === "suspended") {
    redirect("/access-restricted?reason=permission_denied");
  }

  // Internal MacTech operators go straight to the admin dashboard.
  if (ctx.isInternalMacTech && ctx.platformRole !== "none") {
    redirect("/dashboard");
  }

  // Customer user — gather every (org × enabled app) launch path the
  // user can hit right now. Uses the same "active org + active member +
  // enabled app + active|trialing entitlement" rules as the JIT helpers
  // in the sibling apps so the welcome list matches what they can
  // actually use.
  const memberships = await prisma.orgUserAccess.findMany({
    where: { userProfileId: ctx.userProfile.id, status: "active" },
    include: {
      customerOrganization: {
        include: {
          entitlements: {
            where: {
              enabled: true,
              status: { in: ["active", "trialing"] },
            },
            include: { app: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  type Launch = {
    orgId: string;
    orgName: string;
    orgStatus: string;
    appKey: string;
    appName: string;
    appDescription: string | null;
    plan: string;
    role: string;
  };
  const launches: Launch[] = [];
  for (const m of memberships) {
    const org = m.customerOrganization;
    if (org.status === "suspended" || org.status === "archived") continue;
    for (const ent of org.entitlements) {
      if (ent.app.status !== "active" || ent.app.isInternalOnly) continue;
      launches.push({
        orgId: org.id,
        orgName: org.name,
        orgStatus: org.status,
        appKey: ent.app.appKey,
        appName: ent.app.name,
        appDescription: ent.app.description,
        plan: ent.plan,
        role: m.role,
      });
    }
  }

  // Exactly one enabled app — auto-launch.
  if (launches.length === 1) {
    const l = launches[0];
    redirect(`/app-launch/${l.appKey}?orgId=${l.orgId}`);
  }

  const fullName =
    [ctx.userProfile.firstName, ctx.userProfile.lastName].filter(Boolean).join(" ") ||
    ctx.userProfile.email;

  // Zero enabled apps — friendly empty state.
  if (launches.length === 0) {
    return (
      <WelcomeShell userName={fullName} email={ctx.userProfile.email}>
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-warning/15 text-[hsl(38_92%_60%)]">
              <AlertCircle className="h-5 w-5" />
            </div>
            <CardTitle className="mt-3">No apps enabled yet</CardTitle>
            <CardDescription>
              {memberships.length === 0
                ? "You aren't yet a member of any MacTech customer organization. Contact a MacTech admin to be added."
                : "Your organization administrator hasn't enabled any MacTech apps for you yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {memberships.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{m.customerOrganization.name}</div>
                  {m.customerOrganization.primaryContactEmail && (
                    <div className="text-xs text-muted-foreground">
                      Contact: {m.customerOrganization.primaryContactEmail}
                    </div>
                  )}
                </div>
                <Badge variant="muted" className="font-mono text-[10px]">
                  {m.role}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </WelcomeShell>
    );
  }

  // Multiple enabled apps — render a picker grouped by org. Each card
  // links to /app-launch which does the entitlement re-check + audits +
  // forwards to the app's baseUrl with org context.
  const launchesByOrg = new Map<string, { orgName: string; orgStatus: string; items: Launch[] }>();
  for (const l of launches) {
    if (!launchesByOrg.has(l.orgId)) {
      launchesByOrg.set(l.orgId, { orgName: l.orgName, orgStatus: l.orgStatus, items: [] });
    }
    launchesByOrg.get(l.orgId)!.items.push(l);
  }

  return (
    <WelcomeShell userName={fullName} email={ctx.userProfile.email}>
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            Welcome back, {ctx.userProfile.firstName || fullName.split(" ")[0]}
          </h2>
          <p className="text-sm text-muted-foreground">
            Pick where you&apos;d like to start. You can always switch apps from
            inside the suite.
          </p>
        </div>

        {Array.from(launchesByOrg.entries()).map(([orgId, { orgName, orgStatus, items }]) => (
          <section key={orgId} className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span className="font-medium text-foreground">{orgName}</span>
              {orgStatus === "onboarding" && (
                <Badge variant="warning" className="text-[10px]">
                  in onboarding
                </Badge>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((l) => (
                <Link
                  key={`${orgId}-${l.appKey}`}
                  href={`/app-launch/${l.appKey}?orgId=${l.orgId}`}
                  className="group block rounded-lg ring-offset-background transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="h-full transition-colors hover:border-primary/60 hover:bg-card/80">
                    <CardContent className="p-5 flex flex-col gap-3 h-full">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-base font-semibold">{l.appName}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {l.appKey}
                          </div>
                        </div>
                        <Badge variant="muted" className="text-[10px]">
                          {l.plan}
                        </Badge>
                      </div>
                      {l.appDescription && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {l.appDescription}
                        </p>
                      )}
                      <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                        <span className="font-mono">{l.role}</span>
                        <span className="inline-flex items-center gap-1 text-primary opacity-70 group-hover:opacity-100">
                          Launch <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </WelcomeShell>
  );
}

/** Shared chrome — header with the brand mark + signed-in identity card +
 *  a sign-out button so users can switch accounts without dev tools. */
function WelcomeShell({
  userName,
  email,
  children,
}: {
  userName: string;
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid-bg min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/welcome" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Hexagon className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                MacTech Solutions
              </div>
              <div className="text-sm font-semibold">Identity Command Center</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 rounded-md border border-border bg-card px-2 py-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                {initialsFor(userName, email)}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-medium">{userName}</div>
                <div className="text-[10px] text-muted-foreground">{email}</div>
              </div>
            </div>
            <SignOutButton redirectUrl="/sign-in">
              <Button variant="ghost" size="icon" aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </SignOutButton>
          </div>
        </div>
      </header>
      <main className="flex-1 px-6 py-10">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Secured by MacTech Identity
          </span>
          <span>© MacTech Solutions LLC</span>
        </div>
      </footer>
    </div>
  );
}
