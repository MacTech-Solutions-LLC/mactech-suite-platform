"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { requestGrantAction } from "@/lib/auditor-access/server-actions";
import {
  NETWORK_CLASSIFICATIONS,
  DURATION_OPTIONS,
  DEFAULT_GRANT_HOURS,
  type NetworkClassificationCode,
} from "@/lib/auditor-access/constants";

interface Props {
  detectedIp: string;
  detectedIpVersion: 4 | 6 | null;
}

export function AuditorAccessForm({ detectedIp, detectedIpVersion }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ip, setIp] = useState(detectedIp);
  const [overrideIp, setOverrideIp] = useState(false);
  const [classification, setClassification] = useState<NetworkClassificationCode | "">("");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState<number>(DEFAULT_GRANT_HOURS);

  const refused = NETWORK_CLASSIFICATIONS.find(
    (c) => c.code === classification && !c.accepted,
  );
  const reasonOk = reason.trim().length >= 4;
  const ipOk = !!ip && (ip.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(ip));
  const canSubmit = !pending && ipOk && classification && !refused && reasonOk && hours > 0;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    startTransition(async () => {
      const outcome = await requestGrantAction({
        ip,
        classification: classification as NetworkClassificationCode,
        reason,
        durationHours: hours,
      });

      if (outcome.kind === "ok") {
        toast({
          title: "Grant active",
          description: `${outcome.cidr} allowlisted until ${new Date(outcome.expiresAtUtc).toLocaleString()}.`,
        });
        // Reset reason but keep IP / classification so a quick re-request is easy.
        setReason("");
        router.refresh();
        return;
      }

      const errorCopy = outcomeToCopy(outcome);
      toast({
        title: errorCopy.title,
        description: errorCopy.description,
        variant: "destructive",
      });
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-lg border border-border bg-card/60 p-5 md:p-6">
      {/* Source IP */}
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="ip">Source IP</Label>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOverrideIp((v) => !v);
              if (overrideIp) setIp(detectedIp);
            }}
          >
            {overrideIp ? "Use detected IP" : "Override (different network)"}
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            id="ip"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            disabled={!overrideIp}
            placeholder="203.0.113.42"
            className="font-mono text-sm"
          />
          {detectedIpVersion ? (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              IPv{detectedIpVersion}
            </span>
          ) : null}
        </div>
        {!overrideIp ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Detected from your current connection.{" "}
            {!ipOk ? "We couldn’t detect a usable IP — click Override." : null}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Type the public IP you’ll be using to reach the vault. The grant will only allowlist that exact address.
          </p>
        )}
      </div>

      {/* Network classification */}
      <fieldset>
        <legend className="text-sm font-medium">Network classification</legend>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose honestly. The vault treats every grant as a same-egress trust window.
        </p>
        <div className="mt-3 space-y-2">
          {NETWORK_CLASSIFICATIONS.map((c) => {
            const checked = classification === c.code;
            return (
              <label
                key={c.code}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  checked ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/40"
                }`}
              >
                <input
                  type="radio"
                  name="classification"
                  value={c.code}
                  checked={checked}
                  onChange={() => setClassification(c.code)}
                  className="mt-1"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {c.label}
                    {!c.accepted ? (
                      <span className="rounded-sm bg-destructive/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-destructive">
                        refused
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p>
                </div>
              </label>
            );
          })}
        </div>
        {refused ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p>
              We don’t issue IP grants for shared networks. The vault admin would refuse this anyway.
              Use a private network, or contact MacTech for the per-request forward_auth path.
            </p>
          </div>
        ) : null}
      </fieldset>

      {/* Reason */}
      <div>
        <Label htmlFor="reason">Reason</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Free-text. Captured on the grant row and every audit event for assessor review.
        </p>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="C3PAO assessment day 2: reviewing CUI boundary evidence and weekly review acks"
          rows={3}
          className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Duration */}
      <div>
        <Label htmlFor="hours">Duration</Label>
        <select
          id="hours"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="mt-1.5 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {DURATION_OPTIONS.map((d) => (
            <option key={d.hours} value={d.hours}>
              {d.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          The vault re-enforces a 24-hour cap independently. Pick the shortest window that gets the work done.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={!canSubmit}>
          {pending ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Request grant
            </>
          )}
        </Button>
        {!canSubmit && !refused ? (
          <span className="text-xs text-muted-foreground">
            {!ipOk ? "Enter a valid IPv4 or IPv6 address. " : null}
            {!classification ? "Pick a classification. " : null}
            {!reasonOk ? "Reason is required. " : null}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function outcomeToCopy(outcome: { kind: string }): { title: string; description: string } {
  switch (outcome.kind) {
    case "vault_unreachable":
      return {
        title: "Vault edge unreachable",
        description: "No grant issued. Try again in a moment, or contact a MacTech admin.",
      };
    case "vault_disabled":
      return {
        title: "Vault admin endpoint disabled",
        description:
          "The vault hasn’t been wired for auditor access yet. Contact a MacTech admin.",
      };
    case "auth_failed":
      return {
        title: "Vault rejected the request",
        description:
          "Authentication failed (HMAC mismatch or clock skew). MacTech ops needs to investigate.",
      };
    case "validation_failed":
      return {
        title: "Validation failed",
        description: "Check the form and retry.",
      };
    case "replay_detected":
      return {
        title: "Replay detected",
        description: "That request was already submitted. Refresh and try again.",
      };
    case "caddy_reflect_failed":
      return {
        title: "Vault edge could not be updated",
        description: "Caddy admin API rejected the patch. Page on-call has been notified.",
      };
    case "exceeds_max_grant_duration":
      return {
        title: "Duration too long",
        description: "The vault re-enforces a 24-hour cap. Choose a shorter window.",
      };
    default:
      return {
        title: "Request failed",
        description: "Unknown error. Try again or contact MacTech.",
      };
  }
}
