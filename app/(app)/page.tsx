import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  ChartColumn,
  HandCoins,
  Inbox,
  MessageSquareWarning,
  PackageX,
  TrendingUp,
} from "lucide-react";
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { parsePeriod } from "@/lib/period";
import { aed, num } from "@/lib/money";
import { profitSummary } from "@/lib/profit";
import { isLowStock, productCode, type OrderStatus } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, StatCard, StatusPill } from "@/components/ui";

export default async function HomePage() {
  const scope = await getScope();
  const ids = scopedShopIds(scope);
  const today = parsePeriod("today");

  const [statusRes, drafts, priceReqs, escalations, productsRes, codRes, profit] =
    await Promise.all([
      db
        .from("orders")
        .select("status")
        .in("shop_id", ids)
        .gte("created_at", today.start.toISOString())
        .lt("created_at", today.end.toISOString()),
      db
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("shop_id", ids)
        .eq("status", "draft"),
      db
        .from("price_requests")
        .select("id", { count: "exact", head: true })
        .in("shop_id", ids)
        .eq("status", "pending"),
      db
        .from("pending_escalations")
        .select("id", { count: "exact", head: true })
        .in("shop_id", ids)
        .is("resolved_at", null),
      db
        .from("products")
        .select("id,product_number,brand,model,color,quantity,min_qty")
        .in("shop_id", ids)
        .order("quantity")
        .limit(100),
      db.from("cod_ledger").select("entry,amount").in("shop_id", ids),
      profitSummary(ids, today),
    ]);

  const byStatus = new Map<OrderStatus, number>();
  for (const row of statusRes.data ?? []) {
    const s = row.status as OrderStatus;
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }
  const statusOrder: OrderStatus[] = ["draft", "confirmed", "packed", "shipped", "delivered", "cancelled"];

  const lowStock = (productsRes.data ?? []).filter(isLowStock).slice(0, 8);

  // COD outstanding = Σcollect − Σhandover (riders/service.py cod_balance).
  let cod = 0;
  for (const row of codRes.data ?? []) {
    cod += row.entry === "collect" ? num(row.amount) : -num(row.amount);
  }

  const inboxes = [
    {
      href: "/orders?tab=drafts",
      label: "Draft orders",
      count: drafts.count ?? 0,
      icon: Inbox,
      hint: "waiting for confirm / reject",
    },
    {
      href: "/orders?tab=requests",
      label: "Price requests",
      count: priceReqs.count ?? 0,
      icon: HandCoins,
      hint: "customers asking for a price",
    },
    {
      href: "/chats",
      label: "Escalations",
      count: escalations.count ?? 0,
      icon: MessageSquareWarning,
      hint: "customers waiting for a human",
    },
  ];

  return (
    <>
      <PageHeader title="Home" sub={today.label} />

      {/* Needs-attention inboxes first: this is the keeper's worklist. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {inboxes.map(({ href, label, count, icon: Icon, hint }) => (
          <Link key={href} href={href} className="pressable block">
            <Card
              className={`p-4 flex items-center gap-3 hover:border-accent ${
                count > 0 ? "border-accent" : ""
              }`}
            >
              <div className={`rounded-xl p-2.5 ${count > 0 ? "bg-accent text-accent-fg" : "bg-muted text-subtle"}`}>
                <Icon className="size-5" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-semibold tabular">{count}</p>
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-subtle truncate">{hint}</p>
              </div>
              <ArrowRight className="size-4 text-subtle shrink-0" strokeWidth={2} aria-hidden />
            </Card>
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>Today</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Revenue" value={aed(profit.revenue)} icon={Banknote} tone="accent" />
          <StatCard
            label="Gross profit"
            value={aed(profit.profit)}
            icon={TrendingUp}
            tone="info"
            hint={`margin ${profit.margin.toFixed(1)}%`}
          />
          <StatCard label="Orders" value={profit.orders} icon={ChartColumn} tone="violet" />
          <StatCard
            label="COD with riders"
            value={aed(cod)}
            icon={HandCoins}
            tone={cod > 0 ? "warning" : "neutral"}
            hint="all-time outstanding"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {statusOrder.map((s) => {
            const n = byStatus.get(s) ?? 0;
            if (n === 0) return null;
            return (
              <Link key={s} href={`/orders?status=${s}`} className="pressable inline-flex items-center gap-1.5">
                <StatusPill status={s} />
                <span className="text-sm font-semibold tabular">{n}</span>
              </Link>
            );
          })}
          {(statusRes.data ?? []).length === 0 ? (
            <p className="text-sm text-subtle">No orders yet today.</p>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Low stock</SectionTitle>
          <Link href="/inventory?low=1" className="text-sm font-semibold text-accent-text pressable">
            View all
          </Link>
        </div>
        <Card>
          {lowStock.length === 0 ? (
            <EmptyState icon={PackageX} title="Nothing is running low" hint="Products at or under their alert level show up here." />
          ) : (
            <ul className="divide-y divide-border">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Badge tone="neutral">{productCode(p.product_number)}</Badge>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {p.brand} {p.model}
                    {p.color ? <span className="text-subtle font-normal"> · {p.color}</span> : null}
                  </p>
                  <Badge tone={p.quantity === 0 ? "destructive" : "warning"}>
                    {p.quantity === 0 ? "Out of stock" : `${p.quantity} left`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
