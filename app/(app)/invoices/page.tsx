import Link from "next/link";
import { FileText, Printer, ReceiptText } from "lucide-react";
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { parsePeriod } from "@/lib/period";
import { fmtDubai } from "@/lib/period";
import { aed2 } from "@/lib/money";
import { invoiceRef, orderRef, type InvoiceRow } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { CreateInvoiceButton } from "@/components/create-invoice-button";

export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "weekly", label: "7 days" },
  { key: "monthly", label: "This month" },
] as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>;
}) {
  const [{ period: periodParam, date }, scope] = await Promise.all([searchParams, getScope()]);
  const ids = scopedShopIds(scope);
  const period = parsePeriod(date || periodParam || "monthly");

  const [{ data: invRows }, { data: uninvoiced }] = await Promise.all([
    db
      .from("invoices")
      .select("id,shop_id,invoice_number,day_seq,source,customer_name,total,vat_amount,issued_at")
      .in("shop_id", ids)
      .gte("issued_at", period.start.toISOString())
      .lt("issued_at", period.end.toISOString())
      .order("issued_at", { ascending: false }),
    // Delivered orders that never got an invoice yet — one tap creates it.
    db
      .from("orders")
      .select("id,order_number,day_seq,created_at,quantity,customer_name,selling_price,discount_amount,delivered_at, products(category), invoices(id)")
      .in("shop_id", ids)
      .eq("status", "delivered")
      .is("invoices", null)
      .order("delivered_at", { ascending: false })
      .limit(10),
  ]);

  const invoices = (invRows ?? []) as Pick<
    InvoiceRow,
    "id" | "shop_id" | "invoice_number" | "day_seq" | "source" | "customer_name" | "total" | "vat_amount" | "issued_at"
  >[];
  const totalSum = invoices.reduce((s, r) => s + Number(r.total), 0);
  const vatSum = invoices.reduce((s, r) => s + Number(r.vat_amount), 0);
  const shopName = (id: string) => scope.shops.find((s) => s.id === id)?.name;

  return (
    <>
      <PageHeader title="Invoices" sub={`${period.label}${scope.activeShopId ? "" : " · all shops"}`} />

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/invoices?period=${p.key}`}
            aria-current={period.key === p.key ? "page" : undefined}
            className={`pressable inline-flex items-center rounded-xl px-4 py-2.5 min-h-11 text-sm font-semibold ${
              period.key === p.key
                ? "bg-primary text-primary-fg"
                : "bg-surface border border-border text-subtle"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <form action="/invoices" method="get" className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={/^\d{4}-\d{2}-\d{2}$/.test(period.key) ? period.key : ""}
            aria-label="Custom date"
            className="rounded-xl border border-border bg-surface px-3 py-2.5 min-h-11 text-sm"
          />
          <button
            type="submit"
            className="pressable cursor-pointer rounded-xl bg-surface border border-border text-sm font-semibold px-4 min-h-11"
          >
            Go
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Invoiced" value={aed2(totalSum)} icon={FileText} tone="accent" />
        <StatCard label="VAT (5%) collected" value={aed2(vatSum)} icon={ReceiptText} tone="info" />
      </div>

      <Card>
        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices in this period"
            hint="POS sales invoice themselves at checkout; delivered online orders can be invoiced below."
          />
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/invoices/${inv.id}`}
                  className="pressable flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular">
                      {invoiceRef(inv.issued_at, inv.day_seq, inv.invoice_number)}
                      <span className="font-normal text-subtle"> · {inv.customer_name || "walk-in"}</span>
                    </p>
                    <p className="text-xs text-subtle">
                      {fmtDubai(inv.issued_at)}
                      {scope.activeShopId ? "" : ` · ${shopName(inv.shop_id) ?? ""}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge tone={inv.source === "counter" ? "accent" : "info"}>
                      {inv.source === "counter" ? "POS" : "Order"}
                    </Badge>
                    <span className="tabular font-semibold text-sm">{aed2(inv.total)}</span>
                    <Printer className="size-4 text-subtle" strokeWidth={2} aria-hidden />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(uninvoiced ?? []).length > 0 && (
        <>
          <SectionTitle>Delivered orders without an invoice</SectionTitle>
          <Card>
            <ul className="divide-y divide-border">
              {(uninvoiced ?? []).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {orderRef(o.created_at, o.day_seq, o.order_number)} · {o.customer_name}
                    </p>
                    <p className="text-xs text-subtle">
                      delivered {fmtDubai(o.delivered_at)} ·{" "}
                      {aed2(Number(o.selling_price) - Number(o.discount_amount || 0))}
                    </p>
                  </div>
                  <CreateInvoiceButton
                    orderId={o.id}
                    quantity={o.quantity}
                    category={
                      (Array.isArray(o.products) ? o.products[0] : o.products)?.category
                    }
                  />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
