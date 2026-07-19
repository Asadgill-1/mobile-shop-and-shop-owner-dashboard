import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Printer, ReceiptText } from "lucide-react";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { fmtDubai } from "@/lib/period";
import { aed2 } from "@/lib/money";
import { invoiceCode, type InvoiceRow } from "@/lib/types";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, scope] = await Promise.all([params, getScope()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // Tenant guard in the query: foreign invoice == unknown invoice (404).
  const { data } = await db
    .from("invoices")
    .select("*")
    .eq("id", id)
    .in("shop_id", scope.shopIds)
    .maybeSingle();
  if (!data) notFound();
  const inv = data as InvoiceRow;
  const shop = scope.shops.find((s) => s.id === inv.shop_id);

  return (
    <>
      <div className="flex items-center gap-3">
        <Link
          href="/invoices"
          aria-label="Back to invoices"
          className="pressable rounded-xl border border-border bg-surface p-2.5 min-w-11 min-h-11 flex items-center justify-center"
        >
          <ArrowLeft className="size-5" strokeWidth={2} aria-hidden />
        </Link>
        <PageHeader title={invoiceCode(inv.invoice_number)} sub={shop?.name}>
          <Badge tone={inv.source === "counter" ? "accent" : "info"}>
            {inv.source === "counter" ? "POS sale" : "Online order"}
          </Badge>
        </PageHeader>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/invoices/${inv.id}/print?format=receipt`}
          target="_blank"
          className="pressable inline-flex items-center gap-2 rounded-xl bg-accent text-accent-fg font-display font-semibold px-4 py-2.5 min-h-11 text-sm"
        >
          <ReceiptText className="size-4.5" strokeWidth={2} aria-hidden />
          Print slip (80mm)
        </a>
        <a
          href={`/invoices/${inv.id}/print?format=a4`}
          target="_blank"
          className="pressable inline-flex items-center gap-2 rounded-xl border border-border bg-surface font-display font-semibold px-4 py-2.5 min-h-11 text-sm"
        >
          <Printer className="size-4.5" strokeWidth={2} aria-hidden />
          Print A4 / PDF
        </a>
      </div>

      <Card className="p-5 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-wide">Issued</p>
            <p>{fmtDubai(inv.issued_at)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-wide">By</p>
            <p className="truncate">{inv.created_by.replace(/^dashboard:/, "")}</p>
          </div>
          {inv.customer_name && (
            <div>
              <p className="text-xs font-semibold text-subtle uppercase tracking-wide">Customer</p>
              <p>{inv.customer_name}</p>
              {inv.customer_phone && <p className="text-subtle">{inv.customer_phone}</p>}
              {inv.customer_address && <p className="text-subtle">{inv.customer_address}</p>}
            </div>
          )}
          {inv.customer_trn && (
            <div>
              <p className="text-xs font-semibold text-subtle uppercase tracking-wide">Customer TRN</p>
              <p className="tabular">{inv.customer_trn}</p>
            </div>
          )}
        </div>

        <SectionTitle>Items</SectionTitle>
        <ul className="divide-y divide-border">
          {inv.items.map((item, i) => (
            <li key={i} className="py-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.desc}</p>
                <p className="text-xs text-subtle tabular">
                  {item.qty} × {aed2(item.unit_price)}
                  {item.imeis?.length ? ` · IMEI ${item.imeis.join(", ")}` : ""}
                </p>
              </div>
              <span className="tabular font-semibold text-sm shrink-0">{aed2(item.line_total)}</span>
            </li>
          ))}
        </ul>

        <div className="border-t border-border pt-3 flex flex-col gap-1 text-sm ml-auto w-full max-w-60">
          <div className="flex justify-between text-subtle">
            <span>Subtotal (excl. VAT)</span>
            <span className="tabular">{aed2(inv.subtotal)}</span>
          </div>
          <div className="flex justify-between text-subtle">
            <span>VAT {Number(inv.vat_rate)}%</span>
            <span className="tabular">{aed2(inv.vat_amount)}</span>
          </div>
          <div className="flex justify-between font-display font-semibold text-base">
            <span>Total</span>
            <span className="tabular">{aed2(inv.total)}</span>
          </div>
        </div>
      </Card>

      {inv.order_id && (
        <Link href={`/orders/${inv.order_id}`} className="text-sm text-subtle underline underline-offset-2 inline-flex items-center gap-1.5">
          <FileText className="size-4" strokeWidth={2} aria-hidden />
          View the source order
        </Link>
      )}
    </>
  );
}
