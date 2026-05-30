/**
 * /admin/quickbooks — QBO connection status + connect/disconnect.
 *
 * Phase 1: surface whether the OAuth handshake has been completed, when
 * the access + refresh tokens expire, and let the operator connect or
 * disconnect. Phase 2 adds checkout-session telemetry + webhook event tail.
 */

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, Plug } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuickbooksDisconnectButton } from "@/components/forms/quickbooks-disconnect-button";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  env,
  quickbooksOauthConfigured,
  quickbooksWebhookConfigured,
} from "@/lib/env";
import { getActiveConnection } from "@/lib/integrations/quickbooks/connection-service";
import { QBO_PAYMENTS_SCOPE } from "@/lib/integrations/quickbooks/oauth";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const ERROR_LABEL: Record<string, string> = {
  not_configured: "QBO env vars are missing. Set QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, and QBO_ENCRYPTION_KEY.",
  missing_params: "Intuit redirected without the expected code/realmId/state — try again.",
  state_mismatch: "OAuth state cookie did not match. Try again in the same browser session.",
  exchange_failed: "Intuit rejected the authorization code. Check the redirect URI matches what's registered.",
  access_denied: "Consent screen was cancelled.",
};

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function QuickbooksAdminPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.QUICKBOOKS_MANAGE);

  const oauthOk = quickbooksOauthConfigured();
  const webhookOk = quickbooksWebhookConfigured();
  const connection = oauthOk ? await getActiveConnection() : null;
  const recentEvents = await prisma.quickbooksWebhookEvent.findMany({
    orderBy: { receivedAt: "desc" },
    take: 10,
  });

  const justConnected =
    typeof searchParams?.connected === "string" && searchParams.connected === "1";
  const errKey = typeof searchParams?.error === "string" ? searchParams.error : null;

  const now = Date.now();
  const accessExpiringSoon =
    connection &&
    connection.accessTokenExpiresAt.getTime() - now < 10 * 60 * 1000;
  const refreshExpiringSoon =
    connection &&
    connection.refreshTokenExpiresAt.getTime() - now < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-6">
      <PageHeader
        title="QuickBooks Online"
        description="OAuth connection that backs commerce — package checkout, invoices, recurring billing. One realm per environment."
        actions={
          connection ? (
            <QuickbooksDisconnectButton />
          ) : oauthOk ? (
            <Button asChild>
              <a href="/api/integrations/quickbooks/connect">
                <Plug className="h-4 w-4" />
                Connect QuickBooks
              </a>
            </Button>
          ) : null
        }
      />

      {justConnected ? (
        <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div>QuickBooks connected. Tokens are encrypted at rest with QBO_ENCRYPTION_KEY.</div>
        </div>
      ) : null}

      {errKey ? (
        <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>{ERROR_LABEL[errKey] ?? `OAuth error: ${errKey}`}</div>
        </div>
      ) : null}

      {/* Payments capability — charging cards/ACH from /admin/orders needs
          the Payments scope, which a pre-existing connection won't have. */}
      {connection && !connection.scope?.includes(QBO_PAYMENTS_SCOPE) ? (
        <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            This connection isn&apos;t authorized for <strong>QuickBooks Payments</strong>, so in-suite
            card / ACH charging on the Orders page is disabled. Recording manual payments still works.{" "}
            <a href="/api/integrations/quickbooks/connect" className="font-medium underline">
              Reconnect QuickBooks
            </a>{" "}
            to enable charging.
          </div>
        </div>
      ) : connection ? (
        <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div>Payments scope granted — card / ACH charging is available on the Orders page.</div>
        </div>
      ) : null}

      {/* Configuration banner */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ConfigCard
          title="OAuth credentials"
          ok={oauthOk}
          okText={`Configured (${env.QBO_ENV})`}
          missingText="Set QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, and QBO_ENCRYPTION_KEY."
        />
        <ConfigCard
          title="Webhook verifier"
          ok={webhookOk}
          okText="Configured — inbound deliveries will be signature-verified."
          missingText="Set QBO_WEBHOOK_VERIFIER_TOKEN (Intuit app → Webhooks tab)."
        />
      </div>

      {/* Connection details */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Connection
        </h2>
        <Card>
          <CardContent className="p-4">
            {!connection ? (
              <p className="text-sm text-muted-foreground">
                No active connection. {oauthOk ? "Click Connect QuickBooks above." : "Configure the env vars first."}
              </p>
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Field label="Realm ID">
                  <span className="font-mono text-xs">{connection.realmId}</span>
                </Field>
                <Field label="Environment">
                  <Badge variant={connection.environment === "production" ? "default" : "secondary"}>
                    {connection.environment}
                  </Badge>
                </Field>
                <Field label="Company name">{connection.companyName ?? "—"}</Field>
                <Field label="Connected by">
                  <span className="font-mono text-xs">
                    {connection.connectedByClerkUserId ?? "—"}
                  </span>
                </Field>
                <Field label="Access token expires">
                  <span className={accessExpiringSoon ? "text-warning" : ""}>
                    {fmt(connection.accessTokenExpiresAt)}
                  </span>
                </Field>
                <Field label="Refresh token expires">
                  <span className={refreshExpiringSoon ? "text-warning" : ""}>
                    {fmt(connection.refreshTokenExpiresAt)}
                  </span>
                </Field>
                <Field label="Last refreshed">{fmt(connection.lastRefreshedAt)}</Field>
                <Field label="Last error">
                  {connection.lastErrorMessage ? (
                    <span className="text-destructive">{connection.lastErrorMessage}</span>
                  ) : (
                    "—"
                  )}
                </Field>
              </dl>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Recent webhook deliveries */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Recent webhook deliveries
          </h2>
          <Link
            href="https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Intuit docs <ExternalLink className="ml-1 inline h-3 w-3" />
          </Link>
        </div>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {recentEvents.length === 0 ? (
                <li className="p-4 text-sm text-muted-foreground">
                  No webhook deliveries yet. Once Intuit posts to /api/webhooks/quickbooks, events appear here.
                </li>
              ) : (
                recentEvents.map((evt) => (
                  <li key={evt.id} className="flex items-center gap-3 p-3 text-sm">
                    <Badge
                      variant={
                        evt.status === "processed"
                          ? "default"
                          : evt.status === "failed"
                            ? "destructive"
                            : evt.status === "skipped"
                              ? "outline"
                              : "secondary"
                      }
                    >
                      {evt.status}
                    </Badge>
                    <span className="font-mono text-xs">{evt.eventType ?? "—"}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {fmt(evt.receivedAt)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ConfigCard({
  title,
  ok,
  okText,
  missingText,
}: {
  title: string;
  ok: boolean;
  okText: string;
  missingText: string;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
        ok ? "border-success/30 bg-success/10" : "border-warning/40 bg-warning/10"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      )}
      <div>
        <div className={ok ? "text-success" : "text-warning"}>{title}</div>
        <p className="mt-0.5 text-muted-foreground">{ok ? okText : missingText}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
