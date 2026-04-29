"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { upsertProductEntitlement } from "@/lib/services/entitlement-service";
import { upsertEntitlementSchema } from "@/lib/validations/entitlement";

const PLANS = ["none", "trial", "starter", "professional", "enterprise", "custom"] as const;
const STATUSES = ["active", "trialing", "expired", "suspended"] as const;

export interface EntitlementCardProps {
  customerOrganizationId: string;
  app: { id: string; name: string; appKey: string; description: string | null };
  initial?: {
    enabled: boolean;
    plan: string;
    status: string;
    maxUsers: number | null;
    startsAt: Date | null;
    expiresAt: Date | null;
    configurationJson: unknown;
  } | null;
}

export function EntitlementCard({
  customerOrganizationId,
  app,
  initial,
}: EntitlementCardProps) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const initialConfig =
    initial?.configurationJson != null
      ? JSON.stringify(initial.configurationJson, null, 2)
      : "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{app.name}</CardTitle>
          <p className="text-xs text-muted-foreground font-mono">{app.appKey}</p>
          {app.description && (
            <p className="text-xs text-muted-foreground mt-1">{app.description}</p>
          )}
        </div>
        <Badge variant={enabled ? "success" : "muted"}>{enabled ? "enabled" : "disabled"}</Badge>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setSaved(false);
            const fd = new FormData(event.currentTarget);
            const configRaw = String(fd.get("configurationJson") || "").trim();
            let configurationJson: unknown = undefined;
            if (configRaw.length > 0) {
              try {
                configurationJson = JSON.parse(configRaw);
              } catch {
                setError("Configuration JSON is not valid JSON.");
                return;
              }
            }
            const raw = {
              customerOrganizationId,
              appRegistryId: app.id,
              enabled,
              plan: String(fd.get("plan") || "none"),
              maxUsers: fd.get("maxUsers") ? Number(fd.get("maxUsers")) : undefined,
              startsAt: fd.get("startsAt") ? String(fd.get("startsAt")) : undefined,
              expiresAt: fd.get("expiresAt") ? String(fd.get("expiresAt")) : undefined,
              status: String(fd.get("status") || "active"),
              configurationJson,
            };
            const parsed = upsertEntitlementSchema.safeParse(raw);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? "Invalid input");
              return;
            }
            startTransition(async () => {
              try {
                await upsertProductEntitlement(parsed.data);
                setSaved(true);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to save");
              }
            });
          }}
        >
          <div className="flex items-center justify-between rounded-md border border-border p-2">
            <Label htmlFor={`enabled-${app.id}`} className="text-sm">
              Enabled
            </Label>
            <Switch
              id={`enabled-${app.id}`}
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`plan-${app.id}`}>Plan</Label>
              <Select name="plan" defaultValue={initial?.plan ?? "none"}>
                <SelectTrigger id={`plan-${app.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`status-${app.id}`}>Status</Label>
              <Select name="status" defaultValue={initial?.status ?? "active"}>
                <SelectTrigger id={`status-${app.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`maxUsers-${app.id}`}>Max users</Label>
              <Input
                id={`maxUsers-${app.id}`}
                name="maxUsers"
                type="number"
                min={0}
                defaultValue={initial?.maxUsers ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`startsAt-${app.id}`}>Starts at</Label>
              <Input
                id={`startsAt-${app.id}`}
                name="startsAt"
                type="date"
                defaultValue={
                  initial?.startsAt ? initial.startsAt.toISOString().slice(0, 10) : ""
                }
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={`expiresAt-${app.id}`}>Expires at</Label>
              <Input
                id={`expiresAt-${app.id}`}
                name="expiresAt"
                type="date"
                defaultValue={
                  initial?.expiresAt ? initial.expiresAt.toISOString().slice(0, 10) : ""
                }
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`config-${app.id}`}>Configuration JSON</Label>
            <Textarea
              id={`config-${app.id}`}
              name="configurationJson"
              rows={4}
              defaultValue={initialConfig}
              placeholder='{"foo": "bar"}'
              className="font-mono text-xs"
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {saved && !error && (
            <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success-foreground">
              Saved.
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
