"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Check, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { createApiKey } from "@/lib/services/api-key-service";
import { createApiKeySchema } from "@/lib/validations/api-key";

const SCOPES = [
  {
    value: "audit_ingest",
    label: "audit_ingest",
    description: "POST /api/audit/ingest — forward audit events.",
  },
  {
    value: "app_authority_resolve",
    label: "app_authority_resolve",
    description:
      "POST /api/hub/authority/resolve-app-access — Hub-gated app access for satellite apps.",
  },
  {
    value: "object_reference_write",
    label: "object_reference_write",
    description: "POST /api/hub/object-references/* - create, verify, and deprecate object references.",
  },
  {
    value: "org_read",
    label: "org_read",
    description: "GET /api/v1/orgs/{clerkOrgId} — read org metadata + entitlements.",
  },
  {
    value: "user_access_read",
    label: "user_access_read",
    description:
      "GET /api/v1/users/{clerkUserId}/access — read a user's org memberships + per-app access.",
  },
  {
    value: "webhook_send",
    label: "webhook_send",
    description: "Server-internal: signs outgoing webhook deliveries (rarely issued).",
  },
] as const;

export function CreateApiKeyForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    plaintext: string;
    name: string;
    prefix: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (!o) {
          setIssued(null);
          setError(null);
          setCopied(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Issue API key
        </Button>
      </DialogTrigger>
      <DialogContent>
        {issued ? (
          <>
            <DialogHeader>
              <DialogTitle>API key issued</DialogTitle>
              <DialogDescription>
                Copy the plaintext key now — it will never be shown again. Only
                the SHA-256 hash is stored on the server.
              </DialogDescription>
            </DialogHeader>
            <Alert variant="warning">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>{issued.name}</AlertTitle>
              <AlertDescription>
                Treat this key as a credential. Paste into the receiving app&apos;s
                Railway env vars (or password manager) and dismiss this dialog.
              </AlertDescription>
            </Alert>
            <div className="grid gap-1.5">
              <Label>Plaintext key</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-xs font-mono break-all">
                  {issued.plaintext}
                </code>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(issued.plaintext);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Prefix shown in lists: <span className="font-mono">{issued.prefix}…</span>
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>I&apos;ve saved it</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Issue API key</DialogTitle>
              <DialogDescription>
                Keys are hashed with SHA-256 at rest and shown to you exactly
                once. Pick the minimum scopes the consumer needs.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                const fd = new FormData(event.currentTarget);
                const scopes = fd.getAll("scopes").map(String);
                const raw = {
                  name: String(fd.get("name") || ""),
                  description: String(fd.get("description") || ""),
                  appKey: String(fd.get("appKey") || ""),
                  scopes,
                  expiresAt: fd.get("expiresAt") ? String(fd.get("expiresAt")) : undefined,
                };
                const parsed = createApiKeySchema.safeParse(raw);
                if (!parsed.success) {
                  setError(parsed.error.issues[0]?.message ?? "Invalid input");
                  return;
                }
                startTransition(async () => {
                  try {
                    const result = await createApiKey(parsed.data);
                    setIssued({
                      plaintext: result.plaintext,
                      name: result.name,
                      prefix: result.prefix,
                    });
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to issue key");
                  }
                });
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="e.g. capture-prod-2026-04, or codex-staging"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="appKey">App tag (optional)</Label>
                <Input
                  id="appKey"
                  name="appKey"
                  placeholder="capture, codex, training, quality, …"
                />
                <p className="text-[10px] text-muted-foreground">
                  Lets you filter and rotate keys per consumer app. Doesn&apos;t
                  restrict scope on its own.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={2}
                  placeholder="Where this key will be used + who owns rotation."
                />
              </div>
              <div className="grid gap-2">
                <Label>
                  Scopes <span className="text-destructive">*</span>
                </Label>
                <div className="grid gap-2">
                  {SCOPES.map((s) => (
                    <label
                      key={s.value}
                      className="flex items-start gap-2 rounded-md border border-border p-2"
                    >
                      <Checkbox name="scopes" value={s.value} className="mt-1" />
                      <div className="leading-tight">
                        <div className="text-sm font-mono">{s.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="expiresAt">Expires at (optional)</Label>
                <Input id="expiresAt" name="expiresAt" type="date" />
              </div>
              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Issuing…" : "Issue key"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
