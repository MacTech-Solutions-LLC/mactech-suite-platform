"use client";

/**
 * PublicStatusRow — Slice 11.
 *
 * One-row client component for the /admin/public-status table.
 * Owns the visible toggle + display-name override input. Each
 * mutation calls a server action and shows a transient saved/error
 * indicator so the admin gets immediate feedback.
 */

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  setPublicStatusVisible,
  setPublicStatusDisplayName,
} from "@/lib/services/status/public-status-admin-actions";

type PublicStatus = "operational" | "degraded" | "down" | "unknown";

interface Props {
  appKey: string;
  name: string;
  visible: boolean;
  displayName: string | null;
  publicStatus: PublicStatus;
}

export function PublicStatusRow({
  appKey,
  name,
  visible: initialVisible,
  displayName: initialDisplayName,
  publicStatus,
}: Props) {
  const [visible, setVisible] = useState(initialVisible);
  const [name_, setName_] = useState(initialDisplayName ?? "");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirtyName = (name_.trim() || null) !== (initialDisplayName ?? null);

  function flash() {
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt((t) => (t && Date.now() - t > 1500 ? null : t)), 1700);
  }

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="p-3">
        <div className="text-sm font-medium">{name}</div>
        <div className="text-[11px] font-mono text-muted-foreground">{appKey}</div>
      </td>
      <td className="p-3">
        <PublicStatusPill status={publicStatus} />
      </td>
      <td className="p-3">
        <Switch
          checked={visible}
          disabled={pending}
          onCheckedChange={(next) => {
            setError(null);
            setVisible(next);
            startTransition(async () => {
              try {
                await setPublicStatusVisible(appKey, next);
                flash();
              } catch (err) {
                setVisible(!next);
                setError(err instanceof Error ? err.message : "save_failed");
              }
            });
          }}
          aria-label={`Show ${name} on public status page`}
        />
      </td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <Input
            value={name_}
            onChange={(e) => setName_(e.target.value)}
            placeholder={name}
            className="h-8 text-sm"
            disabled={pending}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!dirtyName || pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await setPublicStatusDisplayName(appKey, name_);
                  flash();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "save_failed");
                }
              });
            }}
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : savedAt ? (
              <Check className="h-3 w-3" />
            ) : (
              "Save"
            )}
          </Button>
        </div>
        {error ? (
          <div className="mt-1 text-[11px] text-destructive">{error}</div>
        ) : null}
      </td>
    </tr>
  );
}

function PublicStatusPill({ status }: { status: PublicStatus }) {
  const variant =
    status === "operational"
      ? "success"
      : status === "degraded"
        ? "warning"
        : status === "down"
          ? "destructive"
          : "muted";
  const label =
    status === "operational"
      ? "Operational"
      : status === "degraded"
        ? "Degraded"
        : status === "down"
          ? "Down"
          : "Unknown";
  return <Badge variant={variant}>{label}</Badge>;
}
