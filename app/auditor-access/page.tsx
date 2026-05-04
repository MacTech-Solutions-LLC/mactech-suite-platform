import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ShieldCheck, LogOut, AlertTriangle, Scale } from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { getCurrentAuthContext } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getVaultAdminClient } from "@/lib/auditor-access/vault-admin-client";
import { detectAuditorIp } from "@/lib/auditor-access/server-actions";
import { AuditorAccessForm } from "@/components/forms/auditor-access-form";
import { ActiveGrantsList } from "@/components/forms/active-grants-list";

export const dynamic = "force-dynamic";

/**
 * /auditor-access — focused vault-IP-allowlist portal.
 *
 * Audience: external C3PAO assessors (cui_auditor role) and MacTech
 * super-admins (for testing). Not part of the admin shell — minimal
 * single-column layout so the auditor's only path is "request a grant,
 * watch the countdown, optionally extend or revoke".
 */
export default async function AuditorAccessPage() {
  const session = await auth();
  if (!session.userId) {
    redirect("/sign-in?redirect_url=/auditor-access");
  }
  const ctx = await getCurrentAuthContext();
  if (!ctx) {
    redirect("/access-restricted?reason=no_profile");
  }
  if (ctx.userProfile.status !== "active") {
    redirect("/access-restricted?reason=permission_denied");
  }

  const allowed =
    ctx.permissions.includes(PLATFORM_PERMISSIONS.VAULT_ALLOWLIST_REQUEST) ||
    ctx.permissions.includes(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);
  if (!allowed) {
    redirect("/access-restricted?reason=permission_denied");
  }

  const detected = await detectAuditorIp();

  // Pull the active set straight from the vault. If the vault is
  // unreachable, render the empty state with a banner rather than
  // crashing the page — the form still works (submit will fail-closed
  // and surface the right toast).
  const client = getVaultAdminClient();
  let vaultGrants: Awaited<ReturnType<NonNullable<typeof client>["listGrants"]>> | null = null;
  if (client) {
    try {
      vaultGrants = await client.listGrants();
    } catch {
      vaultGrants = null;
    }
  }
  const myGrants =
    vaultGrants && vaultGrants.ok && vaultGrants.data?.grants
      ? vaultGrants.data.grants.filter(
          (g) => g.granted_to_email === ctx.userProfile.email,
        )
      : [];
  const vaultUnreachable = client !== null && (vaultGrants === null || (vaultGrants && !vaultGrants.ok));

  const fullName =
    [ctx.userProfile.firstName, ctx.userProfile.lastName].filter(Boolean).join(" ") ||
    ctx.userProfile.email;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Scale className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                MacTech Solutions
              </div>
              <div className="text-sm font-semibold">Vault access</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1.5">
              <ShieldCheck className="h-3 w-3 text-primary" />
              CUI Auditor
            </Badge>
            <span className="hidden sm:inline text-xs text-muted-foreground">{fullName}</span>
            <SignOutButton redirectUrl="/">
              <Button variant="ghost" size="icon" aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </SignOutButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 md:px-6 md:py-10">
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Request vault access</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Submit a time-boxed IP allowlist grant for{" "}
            <span className="font-mono">vault-001.mactechsolutionsllc.com</span>.
            Granting allowlists your declared source IP at the vault edge for the duration you select.
            All grants auto-expire and every action is recorded in the central audit log.
          </p>
        </section>

        {vaultUnreachable ? (
          <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <div className="font-medium">Vault edge unreachable.</div>
              <p className="mt-0.5 text-muted-foreground">
                The vault admin endpoint is not responding. Active grants cannot be listed,
                and submitting a new request will fail-closed. Try again in a moment, or contact a
                MacTech admin if this persists.
              </p>
            </div>
          </div>
        ) : null}

        <AuditorAccessForm
          detectedIp={detected.ip}
          detectedIpVersion={detected.ipVersion}
        />

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Your active grants
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each grant auto-expires at the time shown. We page on-call if anything mutates the
            allowlist outside these rows.
          </p>
          <div className="mt-4">
            <ActiveGrantsList grants={myGrants} />
          </div>
        </section>

        <section className="rounded-md border border-border bg-card/40 p-4 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">What this is, what it isn&rsquo;t.</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              IP-pinning is a <em>same-egress</em> trust grant: anyone routed through the same public
              IP (co-workers, hotel guests, mobile-carrier subscribers) inherits access until the
              grant expires.
            </li>
            <li>
              We refuse <span className="font-mono">unknown_or_shared</span> networks (hotels, conferences, café Wi-Fi). For those,
              ask MacTech for the per-request <span className="font-mono">forward_auth</span> path
              (in development).
            </li>
            <li>
              Every grant, manual revoke, and TTL revoke is forwarded to{" "}
              <span className="font-mono">/admin/audit-logs</span> tagged{" "}
              <span className="font-mono">appKey=enclavewatch</span>.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
