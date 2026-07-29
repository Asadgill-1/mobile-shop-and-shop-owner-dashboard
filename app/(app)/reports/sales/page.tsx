import Link from "next/link";
import { Banknote, Receipt, Tags, TrendingUp } from "lucide-react";
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { dubaiDateISO, fmtDubai, parsePeriod } from "@/lib/period";
import { aed, aed2, num } from "@/lib/money";
import { orderRef } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * What is behind a number on the Reports page.
 *
 * Every stat card links here with the view that explains it, so a figure is never a dead end: the
 * table below is the actual rows the headline was summed from, both channels in one list, and its
 * own totals have to match the card that sent you. Keepers see it too — a shopkeeper who cannot
 * check their own day has to trust a number instead of reading it.
 */
const VIEWS = {
  all: { label: "All sales", hint: "Every sale in the period, both channels" },
  online: { label: "Online sales", hint: "Orders the bot took" },
  counter: { label: "Counter sales", hint: "Walk-ins rung up on the POS" },
  discounts: { label: "Discounts", hint: "Sales where money was given away" },
} as const;
type ViewKey = keyof typeof VIEWS;

const PERIODS = ["today", "yesterday", "weekly", "monthly"] as const;

interface Sale {
  key: string;
  channel: "online" | "counter";
  ref: string;
  product: string;
  qty: number;
  gross: number;
  discount: number;
  cost: number;
  profit: number;
  at: string;
  shopId: string;
  note: string;
  invoiceId: string | null;
}

export default async function SalesBreakdownPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; period?: string; date?: string }>;
}) {
  const [{ view: viewParam, period: periodParam, date }, scope] = await Promise.all([
    searchParams,
    getScope(),
  ]);
  const ids = scopedShopIds(scope);
  const period = parsePeriod(date || periodParam || "today");
  const view: ViewKey = viewParam && viewParam in VIEWS ? (viewParam as ViewKey) : "all";
  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));

  // sold_on is a DATE holding the Dubai day — comparing it to a UTC instant reads a day early.
  const [ordersRes, counterRes] = await Promise.all([
    view === "counter"
      ? { data: [] }
      : db
          .from("orders")
          .select("id,shop_id,order_number,day_seq,created_at,quantity,selling_price,discount_amount,delivery_fee,status, products(brand,model,cost_price)")
          .in("shop_id", ids)
          .neq("status", "cancelled")
          .neq("status", "draft")
          .gte("created_at", period.start.toISOString())
          .lt("created_at", period.end.toISOString()),
    view === "online"
      ? { data: [] }
      : db
          .from("counter_sales")
          .select("id,shop_id,created_at,quantity,sold_price,discount_amount,discrepancy,payment_method,sold_by, products(brand,model,cost_price)")
          .in("shop_id", ids)
          .gte("sold_on", dubaiDateISO(period.start))
          .lt("sold_on", dubaiDateISO(period.end)),
  ]);

  interface OrderRow {
    id: string; shop_id: string; order_number: number | null; day_seq: number | null;
    created_at: string; quantity: number; selling_price: string; discount_amount: string;
    delivery_fee: string | null; status: string;
    products: { brand: string; model: string; cost_price: string } | null;
  }
  interface CounterRow {
    id: string; shop_id: string; created_at: string; quantity: number; sold_price: string;
    discount_amount: string; discrepancy: boolean; payment_method: string | null;
    sold_by: string | null;
    products: { brand: string; model: string; cost_price: string } | null;
  }

  const orderRows = (ordersRes.data ?? []) as unknown as OrderRow[];
  // Discrepancy rows never moved stock, so profit-math excludes them and so must this table.
  const counterRows = ((counterRes.data ?? []) as unknown as CounterRow[]).filter(
    (r) => !r.discrepancy,
  );

  // Invoice links, one query per channel — a row that was invoiced becomes a link to the document.
  const [orderInv, counterInv] = await Promise.all([
    orderRows.length
      ? db.from("invoices").select("id,order_id").is("credit_of", null).in("order_id", orderRows.map((o) => o.id))
      : { data: [] },
    counterRows.length
      ? db.from("invoices").select("id,counter_sale_ids").is("credit_of", null).overlaps("counter_sale_ids", counterRows.map((r) => r.id))
      : { data: [] },
  ]);
  const invoiceOf = new Map<string, string>();
  for (const inv of (orderInv.data ?? []) as { id: string; order_id: string | null }[]) {
    if (inv.order_id) invoiceOf.set(inv.order_id, inv.id);
  }
  for (const inv of (counterInv.data ?? []) as { id: string; counter_sale_ids: string[] | null }[]) {
    for (const saleId of inv.counter_sale_ids ?? []) invoiceOf.set(saleId, inv.id);
  }

  const online: Sale[] = orderRows.map((o) => {
    const gross = num(o.selling_price);
    const discount = num(o.discount_amount);
    const cost = num(o.products?.cost_price) * o.quantity;
    return {
      key: `o${o.id}`,
      channel: "online",
      ref: orderRef(o.created_at, o.day_seq, o.order_number),
      product: `${o.products?.brand ?? "?"} ${o.products?.model ?? "?"}`.trim(),
      qty: o.quantity,
      gross,
      discount,
      cost,
      profit: gross - discount - cost,
      at: o.created_at,
      shopId: o.shop_id,
      note: o.status,
      invoiceId: invoiceOf.get(o.id) ?? null,
    };
  });
  const counter: Sale[] = counterRows.map((r) => {
    const gross = num(r.sold_price) * r.quantity;
    const discount = num(r.discount_amount);
    const cost = num(r.products?.cost_price) * r.quantity;
    return {
      key: `c${r.id}`,
      channel: "counter",
      ref: r.sold_by?.startsWith("void:") ? "reversal" : "POS",
      product: `${r.products?.brand ?? "?"} ${r.products?.model ?? "?"}`.trim(),
      qty: r.quantity,
      gross,
      discount,
      cost,
      profit: gross - discount - cost,
      at: r.created_at,
      shopId: r.shop_id,
      note: r.payment_method ?? "cash",
      invoiceId: invoiceOf.get(r.id) ?? null,
    };
  });

  let rows = [...online, ...counter];
  if (view === "discounts") rows = rows.filter((r) => r.discount !== 0);
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));

  const sum = (pick: (r: Sale) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const gross = sum((r) => r.gross);
  const profit = sum((r) => r.profit);
  // A void is a reversing negative row: it belongs in the table (it happened) but not in the
  // count, or this page would contradict the Orders card that sent the reader here.
  const reversals = rows.filter((r) => r.qty < 0).length;
  const sales = rows.length - reversals;
  const qs = (over: Record<string, string>) =>
    "/reports/sales?" + new URLSearchParams({ view, period: period.key, ...over }).toString();

  return (
    <>
      <PageHeader
        title={VIEWS[view].label}
        sub={`${period.label}${scope.activeShopId ? "" : " · all shops"} · ${VIEWS[view].hint}`}
      >
        <Link
          href={`/reports?period=${period.key}`}
          className="pressable inline-flex items-center rounded-xl border border-border bg-surface px-4 min-h-11 text-sm font-semibold"
        >
          Back to Reports
        </Link>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(VIEWS) as ViewKey[]).map((k) => (
          <Link
            key={k}
            href={qs({ view: k })}
            aria-current={view === k ? "page" : undefined}
            className={`pressable inline-flex items-center rounded-xl px-4 py-2.5 min-h-11 text-sm font-semibold ${
              view === k ? "bg-primary text-primary-fg" : "bg-surface border border-border text-subtle"
            }`}
          >
            {VIEWS[k].label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={qs({ period: p })}
            aria-current={period.key === p ? "page" : undefined}
            className={`pressable inline-flex items-center rounded-xl px-3 py-2 min-h-10 text-sm font-semibold ${
              period.key === p ? "bg-accent text-accent-fg" : "bg-surface border border-border text-subtle"
            }`}
          >
            {p === "weekly" ? "7 days" : p === "monthly" ? "This month" : p[0].toUpperCase() + p.slice(1)}
          </Link>
        ))}
      </div>

      {/* These have to equal the card that sent you here — that is the point of the page. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Sales" value={sales} icon={Receipt} tone="violet" />
        <StatCard label="Revenue" value={aed(gross)} icon={Banknote} tone="accent" />
        <StatCard label="Discounts" value={aed(sum((r) => r.discount))} icon={Tags} tone="warning" />
        <StatCard label="Gross profit" value={aed(profit)} icon={TrendingUp} tone="info" />
      </div>

      <SectionTitle>
        {rows.length} row(s)
        {reversals > 0 ? ` (${reversals} reversal${reversals > 1 ? "s" : ""})` : ""} · cost{" "}
        {aed(sum((r) => r.cost))} · margin{" "}
        {gross > 0 ? ((profit / gross) * 100).toFixed(1) : "0.0"}%
      </SectionTitle>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title="Nothing in this period" hint="Try a wider period above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-subtle border-b border-border">
                  <th className="px-4 py-2.5 font-semibold">Sale</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Qty</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Revenue</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Discount</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Cost</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 300).map((r) => (
                  <tr key={r.key}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone={r.channel === "counter" ? "accent" : "info"}>
                          {r.channel === "counter" ? "Counter" : "Online"}
                        </Badge>
                        <span className="font-semibold">{r.product}</span>
                        {r.invoiceId ? (
                          <Link href={`/invoices/${r.invoiceId}`} className="text-xs underline underline-offset-2">
                            invoice
                          </Link>
                        ) : null}
                      </div>
                      <p className="text-xs text-subtle">
                        {r.ref} · {fmtDubai(r.at)} · {r.note}
                        {shopName.size > 1 ? ` · ${shopName.get(r.shopId) ?? "—"}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{r.qty}</td>
                    <td className="px-4 py-2.5 text-right tabular">{aed2(r.gross)}</td>
                    <td className={`px-4 py-2.5 text-right tabular ${r.discount !== 0 ? "text-warning-text font-semibold" : "text-subtle"}`}>
                      {r.discount !== 0 ? `−${aed2(Math.abs(r.discount))}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular text-subtle">{aed2(r.cost)}</td>
                    <td className={`px-4 py-2.5 text-right tabular font-semibold ${r.profit < 0 ? "text-destructive-text" : ""}`}>
                      {aed2(r.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {rows.length > 300 ? (
        <p className="text-xs text-subtle">First 300 rows shown — narrow the period for the rest.</p>
      ) : null}
      <p className="text-xs text-subtle">
        Revenue is gross and excludes VAT, matching the Reports page; net of discounts is{" "}
        {aed(gross - sum((r) => r.discount))}.
      </p>
    </>
  );
}
