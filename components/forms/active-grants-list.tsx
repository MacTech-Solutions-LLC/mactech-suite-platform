"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, ShieldOff, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { revokeGrantAction } from "@/lib/auditor-access/server-actions";
import { EXTEND_BANNER_REMAINING_MINUTES } from "@/lib/auditor-access/constants";

interface Grant {
  grant_id: string;
  cidr: string;
  ip_version: number;
  network_classification: string;
  granted_to_email: string;
  created_at_utc: string;
  expires_at_utc: string;
  reason: string;
}

interface Props {
  grants: Grant[];
}

export function ActiveGrantsList({ grants }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();

  // Tick once a second so the countdown is live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Refresh server state every 30 s — picks up TTL revokes that the
  // vault made without the page knowing.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);

  if (grants.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No active grants. Use the form above to request one.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {grants.map((g) => (
        <GrantRow key={g.grant_id} grant={g} now={now} />
      ))}
    </ul>
  );
}

function GrantRow({ grant, now }: { grant: Grant; now: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const expiresAt = new Date(grant.expires_at_utc).getTime();
  const remainingMs = Math.max(0, expiresAt - now);
  const remainingMin = Math.floor(remainingMs / 60_000);
  const remainingSec = Math.floor((remainingMs % 60_000) / 1000);
  const lowTime = remainingMin < EXTEND_BANNER_REMAINING_MINUTES;
  const expired = remainingMs === 0;

  const onRevoke = () => {
    if (!confirm(`Revoke the grant for ${grant.cidr}? You'll lose vault access immediately.`)) return;
    startTransition(async () => {
      const result = await revokeGrantAction(grant.grant_id);
      if (result.ok) {
        toast({ title: "Grant revoked", description: `${grant.cidr} no longer allowlisted.` });
        router.refresh();
      } else {
        toast({
          title: "Revoke failed",
          description: result.error ?? "Unknown error.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <li className="rounded-md border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="font-mono">{grant.cidr}</span>
            <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              {grant.network_classification.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Granted {new Date(grant.created_at_utc).toLocaleString()} ·{" "}
            Expires {new Date(grant.expires_at_utc).toLocaleString()}
          </p>
          {grant.reason ? (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Reason:</span> {grant.reason}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-mono ${
              expired
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : lowTime
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-border bg-secondary text-foreground"
            }`}
          >
            <Clock className="h-3 w-3" />
            {expired
              ? "expired"
              : `${String(remainingMin).padStart(2, "0")}:${String(remainingSec).padStart(2, "0")}`}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || expired}
            onClick={onRevoke}
          >
            <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
            Revoke now
          </Button>
        </div>
      </div>

      {lowTime && !expired ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p>
            Less than {EXTEND_BANNER_REMAINING_MINUTES} minutes remaining. To extend, request a fresh
            grant for the same IP — the new grant will be additive in the audit log.
          </p>
        </div>
      ) : null}
    </li>
  );
}
