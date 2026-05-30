"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, Landmark, Loader2, Wallet } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import {
  getOrderPaymentContext,
  recordManualPayment,
  chargeOrderPayment,
  type OrderPaymentContext,
} from "@/lib/services/payment-service";

type Mode = "record" | "charge";
type Instrument = "card" | "echeck";

function toCents(dollars: string): number {
  return Math.round(parseFloat(dollars || "0") * 100);
}

function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Tokenize a card/bank account directly against Intuit's public tokens
 * endpoint so the raw PAN never reaches our server. Returns an opaque,
 * single-use token we hand to the charge action.
 */
async function tokenize(
  baseUrl: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/quickbooks/v4/payments/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach the card tokenizer." };
  }
  const text = await res.text();
  if (!res.ok) {
    try {
      const parsed = JSON.parse(text);
      const msg = parsed?.errors?.[0]?.detail || parsed?.errors?.[0]?.message;
      return { ok: false, error: msg || `Card details were rejected (${res.status}).` };
    } catch {
      return { ok: false, error: `Card details were rejected (${res.status}).` };
    }
  }
  const data = JSON.parse(text) as { value?: string };
  if (!data.value) return { ok: false, error: "Tokenizer returned no token." };
  return { ok: true, token: data.value };
}

export function ReceivePaymentModal({
  orderId,
  buyerLabel,
  totalCents,
  currency,
  /** QuickBooks Payments base URL (env-derived) for client-side tokenization. */
  paymentsBaseUrl,
  triggerLabel = "Receive payment",
}: {
  orderId: string;
  buyerLabel: string;
  totalCents: number;
  currency: string;
  paymentsBaseUrl: string;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState<Extract<OrderPaymentContext, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [mode, setMode] = useState<Mode>("record");
  const [amount, setAmount] = useState<string>((totalCents / 100).toFixed(2));

  // Record-payment fields
  const [method, setMethod] = useState<"check" | "cash" | "ach" | "other">("check");
  const [txnDate, setTxnDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [referenceNo, setReferenceNo] = useState("");

  // Charge fields
  const [instrument, setInstrument] = useState<Instrument>("card");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExp, setCardExp] = useState(""); // MM/YY
  const [cardCvc, setCardCvc] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardZip, setCardZip] = useState("");
  const [bankName, setBankName] = useState("");
  const [routing, setRouting] = useState("");
  const [account, setAccount] = useState("");
  const [bankPhone, setBankPhone] = useState("");
  const [bankType, setBankType] = useState<"PERSONAL_CHECKING" | "PERSONAL_SAVINGS">("PERSONAL_CHECKING");

  const onOpenChange = (next: boolean) => {
    if (pending || loading) return;
    setOpen(next);
    if (next) loadContext();
    else resetTransient();
  };

  const resetTransient = () => {
    setError(null);
    setCardNumber("");
    setCardExp("");
    setCardCvc("");
    setCardZip("");
    setRouting("");
    setAccount("");
  };

  const loadContext = () => {
    setLoading(true);
    setError(null);
    setCtx(null);
    getOrderPaymentContext(orderId)
      .then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setCtx(res);
        setAmount((res.openBalanceCents / 100).toFixed(2));
        if (!res.paymentsAvailable) setMode("record");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load order."))
      .finally(() => setLoading(false));
  };

  const finish = (result: { ok: true; provisioned: boolean; warning?: string }) => {
    toast({
      title: result.warning ? "Payment recorded with a warning" : "Payment received",
      description:
        result.warning ??
        (result.provisioned
          ? "Invoice closed in QuickBooks and the order was provisioned."
          : "Invoice closed in QuickBooks. Order marked paid."),
      variant: result.warning ? "warning" : "success",
    });
    setOpen(false);
    resetTransient();
    router.refresh();
  };

  const submitRecord = () => {
    setError(null);
    const cents = toCents(amount);
    if (!cents || cents <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    startTransition(async () => {
      const res = await recordManualPayment(orderId, {
        amountCents: cents,
        method,
        referenceNo: referenceNo || null,
        txnDate,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      finish(res);
    });
  };

  const submitCharge = () => {
    setError(null);
    const cents = toCents(amount);
    if (!cents || cents <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    startTransition(async () => {
      // 1. Build the tokenization payload from the entered instrument.
      let tokenBody: Record<string, unknown>;
      let last4: string | null = null;
      let brand: string | null = null;

      if (instrument === "card") {
        const [mm, yy] = cardExp.split("/").map((s) => s.trim());
        if (!mm || !yy) {
          setError("Enter the card expiry as MM/YY.");
          return;
        }
        const number = cardNumber.replace(/\s+/g, "");
        last4 = number.slice(-4);
        tokenBody = {
          card: {
            number,
            expMonth: mm.padStart(2, "0"),
            expYear: yy.length === 2 ? `20${yy}` : yy,
            cvc: cardCvc,
            name: cardName || undefined,
            address: { postalCode: cardZip, country: "US" },
          },
        };
      } else {
        last4 = account.slice(-4);
        brand = "Bank account";
        tokenBody = {
          bankAccount: {
            name: bankName,
            routingNumber: routing,
            accountNumber: account,
            accountType: bankType,
            phone: bankPhone || "0000000000",
          },
        };
      }

      // 2. Tokenize in the browser (PAN never hits our server).
      const tok = await tokenize(paymentsBaseUrl, tokenBody);
      if (!tok.ok) {
        setError(tok.error);
        return;
      }

      // 3. Charge + settle server-side.
      const res = await chargeOrderPayment(orderId, {
        amountCents: cents,
        type: instrument,
        token: tok.token,
        last4,
        brand,
      });
      if (!res.ok) {
        setError(res.declined ? `Declined: ${res.error}` : res.error);
        return;
      }
      finish(res);
    });
  };

  const busy = pending || loading;
  const alreadyPaid = ctx?.alreadyPaid ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Wallet className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive payment</DialogTitle>
          <DialogDescription>
            {buyerLabel}
            {ctx?.docNumber ? ` · Invoice #${ctx.docNumber}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice…
          </div>
        ) : alreadyPaid ? (
          <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">
            This order is already <strong>{ctx?.status}</strong>. No payment is due.
          </div>
        ) : ctx ? (
          <div className="grid gap-4">
            {/* Open balance + amount */}
            <div className="flex items-end justify-between gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="amount">Amount received</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-32"
                  />
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="text-muted-foreground">Open balance</div>
                <div className="font-medium">{fmtMoney(ctx.openBalanceCents, ctx.currency)}</div>
              </div>
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "record" ? "default" : "outline"}
                onClick={() => setMode("record")}
                className="justify-start"
              >
                <Wallet className="h-4 w-4" /> Record payment
              </Button>
              <Button
                type="button"
                variant={mode === "charge" ? "default" : "outline"}
                onClick={() => ctx.paymentsAvailable && setMode("charge")}
                disabled={!ctx.paymentsAvailable}
                className="justify-start"
                title={ctx.paymentsAvailable ? undefined : "Reconnect QuickBooks to enable charging"}
              >
                <CreditCard className="h-4 w-4" /> Charge card / ACH
              </Button>
            </div>

            {mode === "record" ? (
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="method">Method</Label>
                    <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                      <SelectTrigger id="method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="ach">ACH (manual)</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="txnDate">Payment date</Label>
                    <Input id="txnDate" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ref">Reference no. (optional)</Label>
                  <Input
                    id="ref"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="Check #1042"
                  />
                </div>
              </div>
            ) : !ctx.paymentsAvailable ? (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                QuickBooks is connected but not authorized for Payments.{" "}
                <Link href="/admin/quickbooks" className="font-medium underline">
                  Reconnect QuickBooks
                </Link>{" "}
                to enable live card / ACH charging.
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={instrument === "card" ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setInstrument("card")}
                  >
                    <CreditCard className="h-4 w-4" /> Card
                  </Button>
                  <Button
                    type="button"
                    variant={instrument === "echeck" ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setInstrument("echeck")}
                  >
                    <Landmark className="h-4 w-4" /> Bank (ACH)
                  </Button>
                </div>

                {instrument === "card" ? (
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="cc">Card number</Label>
                      <Input
                        id="cc"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="4111 1111 1111 1111"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="exp">Expiry</Label>
                        <Input id="exp" value={cardExp} onChange={(e) => setCardExp(e.target.value)} placeholder="MM/YY" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="cvc">CVC</Label>
                        <Input id="cvc" inputMode="numeric" value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} placeholder="123" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="zip">ZIP</Label>
                        <Input id="zip" inputMode="numeric" value={cardZip} onChange={(e) => setCardZip(e.target.value)} placeholder="94107" />
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ccname">Name on card</Label>
                      <Input id="ccname" autoComplete="cc-name" value={cardName} onChange={(e) => setCardName(e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="bankname">Account holder name</Label>
                      <Input id="bankname" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="routing">Routing number</Label>
                        <Input id="routing" inputMode="numeric" value={routing} onChange={(e) => setRouting(e.target.value)} placeholder="021000021" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="acct">Account number</Label>
                        <Input id="acct" inputMode="numeric" value={account} onChange={(e) => setAccount(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="banktype">Account type</Label>
                        <Select value={bankType} onValueChange={(v) => setBankType(v as typeof bankType)}>
                          <SelectTrigger id="banktype">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PERSONAL_CHECKING">Checking</SelectItem>
                            <SelectItem value="PERSONAL_SAVINGS">Savings</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="bankphone">Phone</Label>
                        <Input id="bankphone" inputMode="tel" value={bankPhone} onChange={(e) => setBankPhone(e.target.value)} placeholder="5551234567" />
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Card / bank details are tokenized in your browser by Intuit — they never touch MacTech Suite servers.
                </p>
              </div>
            )}

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {ctx && !alreadyPaid ? (
            <Button
              type="button"
              onClick={mode === "record" ? submitRecord : submitCharge}
              disabled={busy || (mode === "charge" && !ctx.paymentsAvailable)}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === "charge" ? "Charge & close" : "Record & close"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
