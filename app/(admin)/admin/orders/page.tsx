/**
 * /admin/orders — every Order placed through the marketing site, in
 * descending date order, with QBO invoice IDs, payment + provisioning
 * status, and the resulting customer org once it exists.
 */

import Link from "next/link";
import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import type { OrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<OrderStatus, "default" | "secondary" | "outline" | "destructive" | "warning" | "success"> = {
  pending: "outline",
  payment_pending: "warning",
  paid: "secondary",
  provisioned: "success",
  failed: "destructive",
  refunded: "outline",
  cancelled: "outline",
};

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export default async function OrdersPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.ORDERS_VIEW);

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      package: { select: { name: true, sku: true, billingCycle: true } },
      customerOrganization: { select: { id: true, name: true, slug: true } },
      payments: { select: { id: true, status: true, capturedAt: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Every checkout the marketing site has sent us. Filter by status to triage failed provisioning or unpaid invoices."
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Buyer</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Org</TableHead>
                <TableHead>Placed</TableHead>
                <TableHead>Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No orders yet. Once the marketing site POSTs to /api/checkout/sessions, they appear here.
                  </TableCell>
                </TableRow>
              ) : null}
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="font-medium">{order.buyerEmail}</div>
                    {order.buyerCompany ? (
                      <div className="text-xs text-muted-foreground">{order.buyerCompany}</div>
                    ) : order.buyerName ? (
                      <div className="text-xs text-muted-foreground">{order.buyerName}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div>{order.package.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{order.package.sku}</div>
                  </TableCell>
                  <TableCell>{formatMoney(order.totalCents, order.currency)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[order.status]}>{order.status.replace("_", " ")}</Badge>
                    {order.failureReason ? (
                      <div className="mt-1 text-xs text-destructive line-clamp-1" title={order.failureReason}>
                        {order.failureReason}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {order.qboInvoiceDocNumber ? (
                      <span className="font-mono text-xs">#{order.qboInvoiceDocNumber}</span>
                    ) : order.qboInvoiceId ? (
                      <span className="font-mono text-xs text-muted-foreground">{order.qboInvoiceId.slice(0, 12)}…</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {order.customerOrganization ? (
                      <Link
                        href={`/admin/customer-orgs/${order.customerOrganization.id}`}
                        className="text-primary hover:underline"
                      >
                        {order.customerOrganization.name}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(order.placedAt ?? order.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(order.paidAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
