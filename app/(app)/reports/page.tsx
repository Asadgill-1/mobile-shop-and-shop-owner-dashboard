import Link from "next/link";
import {
  Banknote,
  ChartColumn,
  Package,
  Percent,
  Tags,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { getScope, scopedShopIds } from "@/lib/scope";
import { parsePeriod } from "@/lib/period";
import { aed } from "@/lib/money";
import { profitSummary } from "@/lib/profit";
import { Card, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";

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

      {profit.counterRevenue > 0 ? (
        <p className="text-sm text-subtle">
          Includes counter sales: {aed(profit.counterRevenue)} revenue, {aed(profit.counterProfit)}{" "}
          profit.
        </p>
      ) : null}
      {profit.clearanceProfit !== 0 ? (
        <p className="text-sm text-subtle">Clearance profit: {aed(profit.clearanceProfit)}.</p>
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
    </>
  );
}
