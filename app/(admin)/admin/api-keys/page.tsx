import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert, KeyRound } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { CreateApiKeyForm } from "@/components/forms/create-api-key-form";
import { RevokeApiKeyButton } from "@/components/forms/revoke-api-key-button";
import { RotateApiKeyButton } from "@/components/forms/rotate-api-key-button";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { auditIngestionConfigured } from "@/lib/env";
import { formatDateTime, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);

  const keys = await prisma.apiKey.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="API keys"
        description="Issue, scope, and revoke keys for sibling apps. Each key is SHA-256 hashed at rest and shown to you exactly once at creation time."
        actions={<CreateApiKeyForm />}
      />

      <Alert variant="warning">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Treat keys as credentials</AlertTitle>
        <AlertDescription>
          Plaintext is shown once at issuance and is unrecoverable. Pick the
          minimum scopes the consumer needs. Rotate on personnel changes,
          revoke immediately on any suspected exposure.
        </AlertDescription>
      </Alert>

      {auditIngestionConfigured() && (
        <Alert variant="info">
          <KeyRound className="h-4 w-4" />
          <AlertTitle>Legacy env-var key is still active</AlertTitle>
          <AlertDescription>
            <span className="font-mono">AUDIT_INGEST_API_KEY</span> remains
            valid for backward compatibility (treated as having all scopes).
            Once every sibling app has rotated to a DB-issued key, remove the
            env var from this service&apos;s Railway settings.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>App tag</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.length === 0 ? (
                <TableEmpty
                  colSpan={9}
                  message="No API keys issued yet. Click 'Issue API key' to create one."
                />
              ) : (
                keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>
                      <div className="font-medium">{k.name}</div>
                      {k.description && (
                        <div className="text-xs text-muted-foreground">
                          {k.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{k.keyPrefix}…</TableCell>
                    <TableCell>
                      {k.appKey ? (
                        <Badge variant="muted" className="font-mono text-[10px]">
                          {k.appKey}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <Badge key={s} variant="outline" className="font-mono text-[10px]">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.status === "active" ? "success" : "destructive"}>
                        {k.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(k.lastUsedAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {k.expiresAt ? formatDateTime(k.expiresAt) : "never"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(k.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {k.status === "active" && (
                        <div className="flex items-center justify-end gap-1">
                          <RotateApiKeyButton
                            id={k.id}
                            name={k.name}
                            prefix={k.keyPrefix}
                          />
                          <RevokeApiKeyButton
                            id={k.id}
                            name={k.name}
                            prefix={k.keyPrefix}
                          />
                        </div>
                      )}
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
