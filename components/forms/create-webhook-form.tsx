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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createWebhook } from "@/lib/services/webhook-service";
import { createWebhookSchema, SUPPORTED_EVENTS } from "@/lib/validations/webhook";

export function CreateWebhookForm({
  orgs,
}: {
  orgs: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    name: string;
    secret: string;
    url: string;
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
          <Plus className="h-4 w-4" /> New webhook
        </Button>
      </DialogTrigger>
      <DialogContent>
        {issued ? (
          <>
            <DialogHeader>
              <DialogTitle>Webhook created</DialogTitle>
              <DialogDescription>
                Copy the signing secret now. The receiving app verifies every
                delivery via the <span className="font-mono">X-MacTech-Webhook-Signature</span>{" "}
                header (HMAC-SHA256 of the request body).
              </DialogDescription>
            </DialogHeader>
            <Alert variant="warning">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>{issued.name}</AlertTitle>
              <AlertDescription>
                Delivering to <span className="font-mono">{issued.url}</span>
              </AlertDescription>
            </Alert>
            <div className="grid gap-1.5">
              <Label>Signing secret</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-xs font-mono break-all">
                  {issued.secret}
                </code>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(issued.secret);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>I&apos;ve saved it</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New webhook</DialogTitle>
              <DialogDescription>
                Subscribe to events and we&apos;ll POST a signed payload to
                your URL on every match. Failed deliveries retry with
                exponential backoff up to 5 attempts.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                const fd = new FormData(event.currentTarget);
                const events = fd.getAll("events").map(String);
                const orgId = String(fd.get("customerOrganizationId") || "");
                const raw = {
                  name: String(fd.get("name") || ""),
                  url: String(fd.get("url") || ""),
                  events,
                  customerOrganizationId: orgId === "all" ? null : orgId || null,
                  appKey: String(fd.get("appKey") || ""),
                };
                const parsed = createWebhookSchema.safeParse(raw);
                if (!parsed.success) {
                  setError(parsed.error.issues[0]?.message ?? "Invalid input");
                  return;
                }
                startTransition(async () => {
                  try {
                    const result = await createWebhook(parsed.data);
                    setIssued({
                      name: result.name,
                      secret: result.secret,
                      url: result.url,
                    });
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to create");
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
                  placeholder="e.g. capture-prod-entitlements"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="url">
                  Delivery URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="url"
                  name="url"
                  type="url"
                  required
                  placeholder="https://capture.mactechsolutionsllc.com/webhooks/identity"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="customerOrganizationId">Scope to org</Label>
                <Select name="customerOrganizationId" defaultValue="all">
                  <SelectTrigger id="customerOrganizationId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All organizations</SelectItem>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="appKey">App tag (optional)</Label>
                <Input
                  id="appKey"
                  name="appKey"
                  placeholder="capture, codex, training, quality, …"
                />
              </div>
              <div className="grid gap-2">
                <Label>
                  Events <span className="text-destructive">*</span>
                </Label>
                <div className="grid gap-1 max-h-56 overflow-y-auto rounded-md border border-border p-2">
                  {SUPPORTED_EVENTS.map((e) => (
                    <label key={e} className="flex items-center gap-2 text-sm py-1">
                      <Checkbox name="events" value={e} />
                      <span className="font-mono text-xs">{e}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Tip: subscribe to a wildcard prefix like{" "}
                  <span className="font-mono">entitlement.*</span> by typing it
                  into the box (not yet exposed in this picker).
                </p>
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
                  {pending ? "Creating…" : "Create webhook"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
