import Link from "next/link";
import {
  Ban,
  Banknote,
  ChartColumn,
  CreditCard,
  Landmark,
  Package,
  Percent,
  Store,
  Tags,
  TrendingUp,
  Trophy,
  Turtle,
} from "lucide-react";
import { getScope, scopedShopIds } from "@/lib/scope";
import { parsePeriod } from "@/lib/period";
import { aed } from "@/lib/money";
import { profitSummary } from "@/lib/profit";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "weekly", label: "7 days" },
  { key: "monthly", label: "This month" },
] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>;
}) {
  const [{ period: periodParam, date }, scope] = await Promise.all([searchParams, getScope()]);
  const ids = scopedShopIds(scope);
  const period = parsePeriod(date || periodParam || "today");
  const profit = await profitSummary(ids, period);

  const maxTopProfit = Math.max(1, ...profit.top.map((t) => t.profit));
  const maxDay = Math.max(1, ...profit.daily.map((d) => d.revenue));
  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));
  const isOwner = scope.role === "owner";
  const paymentTotal = profit.payment.cash + profit.payment.card + profit.payment.unspecified;
  const slowMovers = profit.products.filter((p) => p.stock > 0 && p.qty === 0);
  const soldProducts = profit.products.filter((p) => p.qty !== 0).slice(0, 20);

  return (
    <>
      <PageHeader
        title="Reports"
        sub={`${period.label}${scope.activeShopId ? "" : " · all shops"}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/reports?period=${p.key}`}
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
        <form action="/reports" method="get" className="flex items-center gap-2">
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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Orders" value={profit.orders} icon={ChartColumn} tone="violet" />
        <StatCard label="Revenue" value={aed(profit.revenue)} icon={Banknote} tone="accent" />
        <StatCard label="Discounts" value={aed(profit.discounts)} icon={Tags} tone="warning" />
        <StatCard label="Cost" value={aed(profit.cost)} icon={Package} tone="neutral" />
        <StatCard label="Gross profit" value={aed(profit.profit)} icon={TrendingUp} tone="info" />
        <StatCard label="Margin" value={`${profit.margin.toFixed(1)}%`} icon={Percent} tone="accent" />
      </div>

      {profit.clearanceProfit !== 0 ? (
        <p className="text-sm text-subtle">Clearance profit: {aed(profit.clearanceProfit)}.</p>
      ) : null}

      {/* Daily revenue trend — hand-rolled columns, no chart dep */}
      {profit.daily.length > 1 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>Revenue by day</SectionTitle>
          <Card>
            <div className="px-4 py-4">
              <div className="flex items-end gap-1 h-32" role="img" aria-label="Daily revenue bars">
                {profit.daily.map((d) => (
                  <div
                    key={d.day}
                    className="flex-1 h-full flex flex-col justify-end items-center gap-1 min-w-0"
                  >
                    <span className="text-[10px] text-subtle tabular truncate max-w-full">
                      {d.revenue > 0 ? aed(d.revenue).replace(/^AED\s/, "") : ""}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-accent shrink-0"
                      style={{ height: `${d.revenue > 0 ? Math.max(4, (d.revenue / maxDay) * 88) : 0}%` }}
                      title={`${d.day}: ${aed(d.revenue)}`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-subtle tabular">
                <span>{profit.daily[0].day.slice(5)}</span>
                <span>{profit.daily[profit.daily.length - 1].day.slice(5)}</span>
              </div>
            </div>
          </Card>
        </section>
      ) : null}

      {/* Channel + payment split */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Where the money came from</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <div className="px-4 py-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-subtle uppercase tracking-wide">Channel</p>
              <SplitBar
                a={{ label: "Online orders", value: profit.onlineRevenue }}
                b={{ label: "Walk-in (POS)", value: profit.counterRevenue }}
              />
              <p className="text-xs text-subtle">
                Online profit {aed(profit.onlineProfit)} · walk-in profit {aed(profit.counterProfit)}
              </p>
            </div>
          </Card>
          <Card>
            <div className="px-4 py-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-subtle uppercase tracking-wide">
                <CreditCard className="inline size-3.5 mr-1" strokeWidth={2} aria-hidden />
                POS payments
              </p>
              {paymentTotal > 0 ? (
                <>
                  <SplitBar
                    a={{ label: "Cash", value: profit.payment.cash }}
                    b={{ label: "Card", value: profit.payment.card }}
                  />
                  {profit.payment.unspecified > 0 ? (
                    <p className="text-xs text-subtle">
                      + {aed(profit.payment.unspecified)} recorded without a method (bot photo flow)
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-subtle">No walk-in sales in this period.</p>
              )}
            </div>
          </Card>
        </div>
      </section>

      {/* Per-shop comparison — the multi-shop owner's main view */}
      {isOwner && !scope.activeShopId && profit.perShop.length > 1 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>By shop</SectionTitle>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-subtle border-b border-border">
                    <th className="px-4 py-2.5 font-semibold">Shop</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Sales</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Revenue</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Profit</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profit.perShop.map((s) => (
                    <tr key={s.shopId}>
                      <td className="px-4 py-2.5 font-semibold">
                        <Store className="inline size-3.5 mr-1.5 text-subtle" strokeWidth={2} aria-hidden />
                        {shopName.get(s.shopId) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">{s.orders}</td>
                      <td className="px-4 py-2.5 text-right tabular">{aed(s.revenue)}</td>
                      <td className="px-4 py-2.5 text-right tabular font-semibold">{aed(s.profit)}</td>
                      <td className="px-4 py-2.5 text-right tabular">{s.margin.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionTitle>Top products by profit</SectionTitle>
        <Card>
          {profit.top.length === 0 ? (
            <EmptyState icon={Trophy} title="No sales in this period" />
          ) : (
            <ul className="divide-y divide-border">
              {profit.top.map((t, i) => (
                <li key={t.label} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`inline-flex items-center justify-center size-7 rounded-lg text-xs font-bold shrink-0 ${
                      i === 0 ? "bg-accent text-accent-fg" : "bg-muted text-subtle"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{t.label}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.max(4, (t.profit / maxTopProfit) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold tabular">+{aed(t.profit)}</p>
                    <p className="text-xs text-subtle tabular">{t.qty} sold</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Product performance — sold in this period, with stock left */}
      {soldProducts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>Product performance</SectionTitle>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-subtle border-b border-border">
                    <th className="px-4 py-2.5 font-semibold">Product</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Sold</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Revenue</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Profit</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Stock left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {soldProducts.map((p) => (
                    <tr key={p.label}>
                      <td className="px-4 py-2.5 font-semibold">{p.label}</td>
                      <td className="px-4 py-2.5 text-right tabular">{p.qty}</td>
                      <td className="px-4 py-2.5 text-right tabular">{aed(p.revenue)}</td>
                      <td className={`px-4 py-2.5 text-right tabular font-semibold ${p.profit < 0 ? "text-destructive-text" : ""}`}>
                        {aed(p.profit)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {profit.products.filter((p) => p.qty !== 0).length > 20 ? (
            <p className="text-xs text-subtle">Top 20 by revenue shown.</p>
          ) : null}
        </section>
      ) : null}

      {/* Slow movers — stock sitting, zero sales this period */}
      {slowMovers.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>
            <Turtle className="inline size-4 mr-1.5" strokeWidth={2} aria-hidden />
            Not selling ({slowMovers.length})
          </SectionTitle>
          <Card>
            <div className="px-4 py-3 flex flex-wrap gap-1.5">
              {slowMovers.slice(0, 12).map((p) => (
                <Badge key={p.label} tone="neutral">
                  {p.label} · {p.stock} in stock
                </Badge>
              ))}
              {slowMovers.length > 12 ? (
                <span className="text-xs text-subtle self-center">
                  +{slowMovers.length - 12} more
                </span>
              ) : null}
            </div>
          </Card>
        </section>
      ) : null}

      {/* Compliance + leakage summary */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Also in this period</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="VAT collected" value={aed(profit.vatCollected)} icon={Landmark} tone="info" />
          <MaybeLink href={isOwner ? `/logs?view=cancels&period=${period.key}` : null}>
            <StatCard
              label={`Cancellations (${aed(profit.cancels.value)})`}
              value={profit.cancels.count}
              icon={Ban}
              tone={profit.cancels.count > 0 ? "warning" : "neutral"}
            />
          </MaybeLink>
          <MaybeLink href={isOwner ? `/logs?view=discounts&period=${period.key}` : null}>
            <StatCard
              label={`Discounted orders (${aed(profit.discounts)})`}
              value={profit.discountCount}
              icon={Tags}
              tone={profit.discountCount > 0 ? "warning" : "neutral"}
            />
          </MaybeLink>
        </div>
      </section>
    </>
  );
}

/** Two-value proportion bar with labels — the whole "chart library" this page needs. */
function SplitBar({
  a,
  b,
}: {
  a: { label: string; value: number };
  b: { label: string; value: number };
}) {
  const total = a.value + b.value;
  const pa = total > 0 ? (a.value / total) * 100 : 50;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted" aria-hidden>
        <div className="bg-accent" style={{ width: `${pa}%` }} />
        <div className="bg-info" style={{ width: `${100 - pa}%` }} />
      </div>
      <div className="flex justify-between gap-2 text-xs">
        <span className="font-semibold">
          <span className="inline-block size-2 rounded-full bg-accent mr-1" aria-hidden />
          {a.label} {aed(a.value)}
        </span>
        <span className="font-semibold text-right">
          <span className="inline-block size-2 rounded-full bg-info mr-1" aria-hidden />
          {b.label} {aed(b.value)}
        </span>
      </div>
    </div>
  );
}

function MaybeLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className="pressable block">
      {children}
    </Link>
  ) : (
    <>{children}</>
  );
}
