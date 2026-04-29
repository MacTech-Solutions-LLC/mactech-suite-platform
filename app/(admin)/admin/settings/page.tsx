import { PageHeader } from "@/components/layout/admin-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Check, X, ShieldAlert } from "lucide-react";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  envHealth,
  clerkConfigured,
  clerkWebhookConfigured,
  auditIngestionConfigured,
  env,
} from "@/lib/env";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);

  const checks = envHealth();
  const [registeredApps, internalUsers, customerOrgs] = await Promise.all([
    prisma.appRegistry.count(),
    prisma.userProfile.count({ where: { isInternalMacTechUser: true } }),
    prisma.customerOrganization.count(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Platform metadata, integration health, and security recommendations."
      />

      <Alert variant="warning">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>No secrets are displayed on this page</AlertTitle>
        <AlertDescription>
          Only the configured / not-configured state of each environment
          variable is shown. Manage secrets through your hosting provider.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Clerk integration</CardTitle>
            <CardDescription>
              Identity, sessions, organization invitations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Status
              ok={clerkConfigured()}
              label="Publishable + secret key configured"
            />
            <Status
              ok={clerkWebhookConfigured()}
              label="Webhook signing secret configured"
            />
            <p className="text-xs text-muted-foreground">
              Webhook URL:{" "}
              <span className="font-mono">{env.NEXT_PUBLIC_APP_URL}/api/webhooks/clerk</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit ingestion</CardTitle>
            <CardDescription>
              Cross-app audit log submission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Status
              ok={auditIngestionConfigured()}
              label="AUDIT_INGEST_API_KEY configured"
            />
            <p className="text-xs text-muted-foreground">
              Endpoint:{" "}
              <span className="font-mono">{env.NEXT_PUBLIC_APP_URL}/api/audit/ingest</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Header: <span className="font-mono">X-MacTech-Audit-Key</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
            <CardDescription>Required + optional configuration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {checks.map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-2"
              >
                <div className="font-mono text-xs">{c.key}</div>
                <div className="flex items-center gap-2">
                  {c.required ? (
                    <Badge variant="muted">required</Badge>
                  ) : (
                    <Badge variant="outline">optional</Badge>
                  )}
                  {c.ok ? (
                    <Badge variant="success">configured</Badge>
                  ) : (
                    <Badge variant="destructive">missing</Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform metadata</CardTitle>
            <CardDescription>Quick health snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="App URL" value={env.NEXT_PUBLIC_APP_URL} mono />
            <Row label="Sign in URL" value={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL} mono />
            <Row label="After sign in" value={env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL} mono />
            <Row label="Registered apps" value={String(registeredApps)} />
            <Row label="Internal MacTech users" value={String(internalUsers)} />
            <Row label="Customer organizations" value={String(customerOrgs)} />
            <Row label="Node environment" value={env.NODE_ENV} mono />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Security recommendations</CardTitle>
          <CardDescription>
            Defaults the platform expects in a production deployment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Bullet text="All admin routes require an active platform role; verify this in your hosting environment." />
          <Bullet text="Clerk webhook endpoint must use the CLERK_WEBHOOK_SECRET signing flow." />
          <Bullet text="AUDIT_INGEST_API_KEY should be unique per app and rotated on personnel changes." />
          <Bullet text="Database backups should be encrypted at rest; AuditLog table is append-only by policy." />
          <Bullet text="MFA should be required for all platform roles in the Clerk dashboard." />
        </CardContent>
      </Card>
    </div>
  );
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
      <span className="text-sm">{label}</span>
      {ok ? (
        <Badge variant="success" className="gap-1">
          <Check className="h-3 w-3" /> ok
        </Badge>
      ) : (
        <Badge variant="destructive" className="gap-1">
          <X className="h-3 w-3" /> missing
        </Badge>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 items-baseline gap-3 border-b border-border pb-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`col-span-2 text-sm ${mono ? "font-mono break-all" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
      <span>{text}</span>
    </div>
  );
}
