import Link from "next/link";
import { FileText, Printer, ReceiptText } from "lucide-react";
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { parsePeriod } from "@/lib/period";
import { fmtDubai } from "@/lib/period";
import { aed2, withVat } from "@/lib/money";
import { invoiceRef, orderRef, type InvoiceRow } from "@/lib/types";
import { Badge, Card, CsvLink, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { CreateInvoiceButton } from "@/components/create-invoice-button";

export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "weekly", label: "7 days" },
  { key: "monthly", label: "This month" },
] as const;

/** Delivered orders waiting for an invoice, per page. The queue is work, not a preview — it has to
 *  be possible to reach the end of it. */
const QUEUE_PAGE = 20;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string; queue?: string }>;
}) {
  const [{ period: periodParam, date, queue }, scope] = await Promise.all([searchParams, getScope()]);
  const ids = scopedShopIds(scope);
  const period = parsePeriod(date || periodParam || "monthly");
  const from = Math.max(0, Number.parseInt(queue ?? "0", 10) || 0);

  const [{ data: invRows }, { data: uninvoiced, count: queueCount }] = await Promise.all([
    db
      .from("invoices")
      .select("id,shop_id,invoice_number,day_seq,source,customer_name,total,vat_amount,issued_at,credit_of")
      .in("shop_id", ids)
      .gte("issued_at", period.start.toISOString())
      .lt("issued_at", period.end.toISOString())
      .order("issued_at", { ascending: false }),
    // Delivered orders that never got an invoice yet — one tap creates it. Counted exactly and
    // paged: capped at 10 with no total, an eleventh order simply vanished from the queue, and a
    // supply with no tax invoice is the one that gets found at audit.
    db
      .from("orders")
      .select("id,order_number,day_seq,created_at,quantity,customer_name,selling_price,discount_amount,delivered_at, products(category), invoices(id)", { count: "exact" })
      .in("shop_id", ids)
      .eq("status", "delivered")
      .is("invoices", null)
      .order("delivered_at", { ascending: false })
      .range(from, from + QUEUE_PAGE - 1),
  ]);

  const invoices = (invRows ?? []) as Pick<
    InvoiceRow,
    "id" | "shop_id" | "invoice_number" | "day_seq" | "source" | "customer_name" | "total" | "vat_amount" | "issued_at" | "credit_of"
  >[];
  // Credit notes carry negative amounts, so both totals net out on a plain sum — the VAT line is
  // what the shop actually owes for the period, reversals included.
  const totalSum = invoices.reduce((s, r) => s + Number(r.total), 0);
  const vatSum = invoices.reduce((s, r) => s + Number(r.vat_amount), 0);
  const shopName = (id: string) => scope.shops.find((s) => s.id === id)?.name;

  return (
    <>
      <PageHeader title="Invoices" sub={`${period.label}${scope.activeShopId ? "" : " · all shops"}`}>
        <CsvLink
          href={`/invoices/export?period=${encodeURIComponent(period.key)}`}
          label={`Export the invoice register for ${period.label} as CSV`}
        />
      </PageHeader>

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
                      {invoiceRef(inv.issued_at, inv.day_seq, inv.invoice_number, !!inv.credit_of)}
                      <span className="font-normal text-subtle"> · {inv.customer_name || "walk-in"}</span>
                    </p>
                    <p className="text-xs text-subtle">
                      {fmtDubai(inv.issued_at)}
                      {scope.activeShopId ? "" : ` · ${shopName(inv.shop_id) ?? ""}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Which channel sold it, on every document — a credit note keeps its channel
                        badge too, or the reversal would lose the only clue where it came from. */}
                    <span className="flex flex-wrap justify-end gap-1">
                      <Badge tone={inv.source === "counter" ? "accent" : "info"}>
                        {inv.source === "counter" ? "Counter sale" : "Online sale"}
                      </Badge>
                      {inv.credit_of ? <Badge tone="destructive">Credit note</Badge> : null}
                    </span>
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
          <SectionTitle>
            Delivered orders without an invoice
            {queueCount ? ` (${queueCount})` : ""}
          </SectionTitle>
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
                      {/* what the invoice will total: stored prices are ex-VAT (030) */}
                      {aed2(withVat(Number(o.selling_price) - Number(o.discount_amount || 0)))}
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
          {(from > 0 || (queueCount ?? 0) > from + QUEUE_PAGE) && (
            <div className="flex items-center justify-between gap-3">
              {from > 0 ? (
                <Link
                  href={`/invoices?period=${period.key}&queue=${Math.max(0, from - QUEUE_PAGE)}`}
                  className="pressable inline-flex items-center rounded-xl border border-border bg-surface px-4 min-h-11 text-sm font-semibold"
                >
                  Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-subtle tabular">
                {from + 1}–{Math.min(from + QUEUE_PAGE, queueCount ?? 0)} of {queueCount ?? 0}
              </span>
              {(queueCount ?? 0) > from + QUEUE_PAGE ? (
                <Link
                  href={`/invoices?period=${period.key}&queue=${from + QUEUE_PAGE}`}
                  className="pressable inline-flex items-center rounded-xl border border-border bg-surface px-4 min-h-11 text-sm font-semibold"
                >
                  Older
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
