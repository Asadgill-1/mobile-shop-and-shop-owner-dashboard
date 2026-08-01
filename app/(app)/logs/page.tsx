import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, KeyRound, ScrollText, Tags } from "lucide-react";
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { dubaiDateISO, fmtDubai, parsePeriod } from "@/lib/period";
import { aed } from "@/lib/money";
import { actorName, categoryOf, changeLines, humanize } from "@/lib/activity";
import type { ActivityCategory } from "@/lib/activity";
import type { AuditRow } from "@/lib/types";
import { Badge, Card, CsvLink, EmptyState, PageHeader, SectionTitle } from "@/components/ui";

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "weekly", label: "7 days" },
  { key: "monthly", label: "This month" },
] as const;

const VIEWS = [
  { key: "activity", label: "Activity" },
  { key: "approvals", label: "Approvals" },
  { key: "cancels", label: "Cancellations" },
  { key: "discounts", label: "Discounts" },
] as const;

const CATS = [
  { key: "all", label: "All" },
  { key: "orders", label: "Orders" },
  { key: "products", label: "Products" },
  { key: "pos", label: "POS" },
  { key: "chats", label: "Chats" },
] as const;

interface ApprovalRow {
  id: number;
  shop_id: string;
  kind: string;
  outcome: "approved" | "refused" | "locked" | "unset";
  amount: string | null;
  threshold: string | null;
  detail: string | null;
  actor: string;
  created_at: string;
}

/** What each kind was, in the owner's words rather than the column's. */
const KIND_LABEL: Record<string, string> = {
  discount: "Cart discount",
  unit_price: "Price at the till",
  void: "Void",
  cancel: "Order cancelled",
  stock_adjust: "Stock corrected",
  product_delete: "Product deleted",
  cost_edit: "Cost price edited",
  price_cut: "Selling price cut",
  trn: "TRN changed",
};

/** The unit follows `kind` (035): whole units for a stock correction, percent for a price cut, AED
 *  for everything else. "AED 5" against a 5-unit limit reads as five dirhams. */
function limitText(kind: string, threshold: number): string {
  if (kind === "stock_adjust") return `${threshold} units`;
  if (kind === "price_cut") return `${threshold}%`;
  return aed(threshold);
}

const OUTCOME: Record<string, { tone: "accent" | "destructive" | "warning" | "neutral"; label: string }> = {
  approved: { tone: "accent", label: "approved" },
  refused: { tone: "destructive", label: "wrong PIN" },
  locked: { tone: "destructive", label: "locked out" },
  unset: { tone: "warning", label: "no PIN set" },
};

interface CancelRow {
  id: string;
  shop_id: string;
  order_number: number | null;
  quantity: number;
  selling_price: string;
  cancel_remarks: string | null;
  created_at: string;
  products: { brand: string; model: string } | null;
  order_status_history: { status: string; changed_by: string | null; changed_at: string }[];
}

interface DiscountRow {
  id: string;
  shop_id: string;
  order_number: number | null;
  quantity: number;
  selling_price: string;
  discount_amount: string;
  status: string;
  created_at: string;
  products: { brand: string; model: string } | null;
}

interface CounterDiscountRow {
  id: string;
  shop_id: string;
  quantity: number;
  sold_price: string;
  discount_amount: string;
  sold_by: string | null;
  created_at: string;
  products: { brand: string; model: string } | null;
}

/** One discounted sale, whichever channel gave the money away. */
interface Giveaway {
  key: string;
  channel: "online" | "counter";
  label: string;
  gross: number;
  discount: number;
  at: string;
  shopId: string;
  note: string;
  invoiceId: string | null;
}

/** Owner-only transparency feed: every shop action, price changes front and center (PLAN §5.9
 *  Oversight, absorbed into one tab). Keepers get an identical 404 — same as a foreign shop. */
export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; period?: string; date?: string; cat?: string }>;
}) {
  const [{ view: viewParam, period: periodParam, date, cat: catParam }, scope] = await Promise.all([
    searchParams,
    getScope(),
  ]);
  if (scope.role !== "owner") notFound();

  const ids = scopedShopIds(scope);
  const period = parsePeriod(date || periodParam || "today");
  const view = VIEWS.some((v) => v.key === viewParam) ? viewParam! : "activity";
  const cat = CATS.some((c) => c.key === catParam) ? catParam! : "all";
  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));
  const qs = (over: Record<string, string>) =>
    "/logs?" +
    new URLSearchParams({ view, period: period.key, cat, ...over }).toString();

  // Actor names: telegram ids → keeper/rider names, one fetch each (backend actors-map pattern).
  const [keepersRes, ridersRes] = await Promise.all([
    db.from("shopkeepers").select("telegram_id,name").in("shop_id", ids),
    db.from("delivery_persons").select("telegram_id,name").in("shop_id", ids),
  ]);
  const names: Record<string, string> = {};
  for (const r of [...(keepersRes.data ?? []), ...(ridersRes.data ?? [])]) {
    if (r.telegram_id != null) names[String(r.telegram_id)] = r.name;
  }

  return (
    <>
      <PageHeader
        title="Shop logs"
        sub={`${period.label}${scope.activeShopId ? "" : " · all shops"}`}
      >
        <CsvLink
          href={`/logs/export?${new URLSearchParams({ view, period: period.key }).toString()}`}
          label={`Export ${view} logs for ${period.label} as CSV`}
        />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={qs({ view: v.key })}
            aria-current={view === v.key ? "page" : undefined}
            className={`pressable inline-flex items-center rounded-xl px-4 py-2.5 min-h-11 text-sm font-semibold ${
              view === v.key
                ? "bg-primary text-primary-fg"
                : "bg-surface border border-border text-subtle"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={qs({ period: p.key })}
            aria-current={period.key === p.key ? "page" : undefined}
            className={`pressable inline-flex items-center rounded-xl px-3 py-2 min-h-10 text-sm font-semibold ${
              period.key === p.key
                ? "bg-accent text-accent-fg"
                : "bg-surface border border-border text-subtle"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <form action="/logs" method="get" className="flex items-center gap-2">
          <input type="hidden" name="view" value={view} />
          <input
            type="date"
            name="date"
            defaultValue={/^\d{4}-\d{2}-\d{2}$/.test(period.key) ? period.key : ""}
            aria-label="Custom date"
            className="rounded-xl border border-border bg-surface px-3 py-2 min-h-10 text-sm"
          />
          <button
            type="submit"
            className="pressable cursor-pointer rounded-xl bg-surface border border-border text-sm font-semibold px-3 min-h-10"
          >
            Go
          </button>
        </form>
      </div>

      {view === "activity" ? (
        <Activity ids={ids} period={period} cat={cat} names={names} shopName={shopName} qs={qs} />
      ) : view === "approvals" ? (
        <Approvals ids={ids} period={period} names={names} shopName={shopName} />
      ) : view === "cancels" ? (
        <Cancels ids={ids} period={period} names={names} shopName={shopName} />
      ) : (
        <Discounts ids={ids} period={period} names={names} shopName={shopName} />
      )}
    </>
  );
}

async function Activity({
  ids,
  period,
  cat,
  names,
  shopName,
  qs,
}: {
  ids: string[];
  period: { start: Date; end: Date };
  cat: string;
  names: Record<string, string>;
  shopName: Map<string, string>;
  qs: (over: Record<string, string>) => string;
}) {
  const { data } = await db
    .from("audit_logs")
    .select("id,shop_id,actor,action,detail,created_at")
    .in("shop_id", ids)
    .gte("created_at", period.start.toISOString())
    .lt("created_at", period.end.toISOString())
    .order("created_at", { ascending: false })
    .limit(400);

  const all = (data ?? []) as AuditRow[];
  const rows =
    cat === "all" ? all : all.filter((r) => categoryOf(r.action) === (cat as ActivityCategory));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {CATS.map((c) => (
          <Link
            key={c.key}
            href={qs({ cat: c.key })}
            aria-current={cat === c.key ? "page" : undefined}
            className={`pressable inline-flex items-center rounded-full px-3.5 py-1.5 min-h-9 text-xs font-semibold ${
              cat === c.key
                ? "bg-primary text-primary-fg"
                : "bg-surface border border-border text-subtle"
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nothing logged in this period" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const diffs = changeLines(r);
              const isEdit = r.action === "dedit";
              return (
                <li key={r.id} className="px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{actorName(r.actor, names)}</span>
                    <span className={`text-sm ${isEdit ? "font-semibold text-warning-text" : ""}`}>
                      {humanize(r)}
                    </span>
                  </div>
                  {diffs.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {diffs.map((d) => (
                        <span
                          key={d}
                          className="inline-flex rounded-lg bg-warning-soft text-warning-text text-xs font-semibold px-2 py-0.5"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="text-xs text-subtle">
                    {fmtDubai(r.created_at)}
                    {r.shop_id && shopName.size > 1
                      ? ` · ${shopName.get(r.shop_id) ?? "—"}`
                      : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {all.length === 400 ? (
        <p className="text-xs text-subtle">Showing the latest 400 entries — narrow the period for more.</p>
      ) : null}
    </section>
  );
}

/**
 * Everything that crossed a manager-PIN threshold (migration 035), whatever the outcome — the
 * separate approvals log, as a view here rather than a route of its own.
 *
 * `unset` is the row that matters most on a shop with no PIN yet: nothing was blocked, and this is
 * the priced list of what went through unsupervised. It leads the summary for that reason.
 */
async function Approvals({
  ids,
  period,
  names,
  shopName,
}: {
  ids: string[];
  period: { start: Date; end: Date };
  names: Record<string, string>;
  shopName: Map<string, string>;
}) {
  const { data } = await db
    .from("override_approvals")
    .select("id,shop_id,kind,outcome,amount,threshold,detail,actor,created_at")
    .in("shop_id", ids)
    .gte("created_at", period.start.toISOString())
    .lt("created_at", period.end.toISOString())
    .order("created_at", { ascending: false })
    .limit(400);

  const rows = (data ?? []) as ApprovalRow[];
  const count = (o: string) => rows.filter((r) => r.outcome === o).length;
  const unset = count("unset");

  return (
    <section className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <SectionTitle>
          {unset > 0 ? `${unset} went through with no PIN set · ` : ""}
          {count("approved")} approved · {count("refused") + count("locked")} refused
        </SectionTitle>
      ) : null}
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="Nothing needed approval in this period"
            hint="Discounts, prices, voids, cancellations and stock corrections appear here once they cross a limit."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const o = OUTCOME[r.outcome] ?? { tone: "neutral" as const, label: r.outcome };
              return (
                <li key={r.id} className="px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{KIND_LABEL[r.kind] ?? r.kind}</span>
                    <Badge tone={o.tone}>{o.label}</Badge>
                    {r.amount != null && r.threshold != null ? (
                      <span className="text-xs text-subtle tabular">
                        limit {limitText(r.kind, Number(r.threshold))}
                      </span>
                    ) : null}
                  </div>
                  {r.detail ? <p className="text-sm">{r.detail}</p> : null}
                  <p className="text-xs text-subtle">
                    {fmtDubai(r.created_at)} · {actorName(r.actor, names)}
                    {shopName.size > 1 ? ` · ${shopName.get(r.shop_id) ?? "—"}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {rows.length === 400 ? (
        <p className="text-xs text-subtle">Showing the latest 400 — narrow the period for more.</p>
      ) : null}
    </section>
  );
}

/** Mirror of orders/service.py::cancelled_orders — remarks front and center. */
async function Cancels({
  ids,
  period,
  names,
  shopName,
}: {
  ids: string[];
  period: { start: Date; end: Date };
  names: Record<string, string>;
  shopName: Map<string, string>;
}) {
  const { data } = await db
    .from("orders")
    .select(
      "id,shop_id,order_number,quantity,selling_price,cancel_remarks,created_at, products(brand,model), order_status_history(status,changed_by,changed_at)",
    )
    .in("shop_id", ids)
    .eq("status", "cancelled")
    .gte("created_at", period.start.toISOString())
    .lt("created_at", period.end.toISOString())
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as CancelRow[];
  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState icon={Ban} title="No cancellations in this period" />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((o) => {
            const hist = o.order_status_history.find((h) => h.status === "cancelled");
            // Remarks live in TWO places: cancel_remarks (rider cancels) or the cancelled
            // history row's changed_by (shop rejections) — same recovery as the bot report.
            const remark = o.cancel_remarks || hist?.changed_by || "no remark";
            const who = hist?.changed_by && names[hist.changed_by] ? names[hist.changed_by] : null;
            return (
              <li key={o.id} className="px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">
                    #{o.order_number ?? "—"} · {o.products?.brand} {o.products?.model} ×{o.quantity}
                  </span>
                  <span className="text-sm tabular text-subtle">{aed(Number(o.selling_price))}</span>
                  <Badge tone="destructive">cancelled</Badge>
                </div>
                <p className="text-sm text-warning-text font-semibold">“{remark}”</p>
                <p className="text-xs text-subtle">
                  {fmtDubai(hist?.changed_at ?? o.created_at)}
                  {who ? ` · by ${who}` : ""}
                  {shopName.size > 1 ? ` · ${shopName.get(o.shop_id) ?? "—"}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/**
 * Every discount the shop gave, both channels in one list: what the bot conceded while bargaining
 * (orders.discount_amount) and what a keeper knocked off at the till (counter_sales.discount_amount,
 * 030). Counter rows link to the tax invoice they were sold on where one exists.
 *
 * Mirror of orders/service.py::discounted_orders on the online half.
 */
async function Discounts({
  ids,
  period,
  names,
  shopName,
}: {
  ids: string[];
  period: { start: Date; end: Date };
  names: Record<string, string>;
  shopName: Map<string, string>;
}) {
  // sold_on is a DATE holding the Dubai day — comparing it to a UTC instant reads a day early.
  const [ordersRes, counterRes, invRes] = await Promise.all([
    db
      .from("orders")
      .select(
        "id,shop_id,order_number,quantity,selling_price,discount_amount,status,created_at, products(brand,model)",
      )
      .in("shop_id", ids)
      .neq("status", "draft")
      .gt("discount_amount", 0)
      .gte("created_at", period.start.toISOString())
      .lt("created_at", period.end.toISOString())
      .order("created_at", { ascending: false }),
    db
      .from("counter_sales")
      .select("id,shop_id,quantity,sold_price,discount_amount,sold_by,created_at, products(brand,model)")
      .in("shop_id", ids)
      .gt("discount_amount", 0)
      .gte("sold_on", dubaiDateISO(period.start))
      .lt("sold_on", dubaiDateISO(period.end)),
    db
      .from("invoices")
      .select("id,counter_sale_ids")
      .in("shop_id", ids)
      .eq("source", "counter")
      .is("credit_of", null)
      .gte("issued_at", period.start.toISOString())
      .lt("issued_at", period.end.toISOString()),
  ]);

  const invoiceOf = new Map<string, string>();
  for (const inv of invRes.data ?? []) {
    for (const saleId of inv.counter_sale_ids ?? []) invoiceOf.set(saleId, inv.id);
  }

  const online: Giveaway[] = ((ordersRes.data ?? []) as unknown as DiscountRow[]).map((o) => ({
    key: `o${o.id}`,
    channel: "online",
    label: `#${o.order_number ?? "—"} · ${o.products?.brand ?? "?"} ${o.products?.model ?? "?"} ×${o.quantity}`,
    gross: Number(o.selling_price),
    discount: Number(o.discount_amount),
    at: o.created_at,
    shopId: o.shop_id,
    note: o.status,
    invoiceId: null,
  }));
  const counter: Giveaway[] = ((counterRes.data ?? []) as unknown as CounterDiscountRow[]).map((r) => ({
    key: `c${r.id}`,
    channel: "counter",
    label: `${r.products?.brand ?? "?"} ${r.products?.model ?? "?"} ×${r.quantity}`,
    gross: Number(r.sold_price) * r.quantity,
    discount: Number(r.discount_amount),
    at: r.created_at,
    shopId: r.shop_id,
    note: r.sold_by ? actorName(r.sold_by, names) : "counter",
    invoiceId: invoiceOf.get(r.id) ?? null,
  }));

  const rows = [...online, ...counter].sort((a, b) => (a.at < b.at ? 1 : -1));
  const total = rows.reduce((s, r) => s + r.discount, 0);
  const counterTotal = counter.reduce((s, r) => s + r.discount, 0);

  return (
    <section className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <SectionTitle>
          {rows.length} discounted sale(s) · {aed(total)} given away · counter {aed(counterTotal)} ·
          online {aed(total - counterTotal)}
        </SectionTitle>
      ) : null}
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Tags} title="No discounts in this period" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{r.label}</p>
                    <p className="text-xs text-subtle">
                      {fmtDubai(r.at)}
                      {shopName.size > 1 ? ` · ${shopName.get(r.shopId) ?? "—"}` : ""} · {r.note}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge tone={r.channel === "counter" ? "accent" : "info"}>
                      {r.channel === "counter" ? "Counter sale" : "Online sale"}
                    </Badge>
                    <div className="text-right">
                      <p className="font-semibold tabular text-warning-text">−{aed(r.discount)}</p>
                      <p className="text-xs text-subtle tabular">of {aed(r.gross)}</p>
                    </div>
                  </div>
                </>
              );
              return (
                <li key={r.key}>
                  {r.invoiceId ? (
                    <Link
                      href={`/invoices/${r.invoiceId}`}
                      className="pressable flex items-center gap-3 px-4 py-3 hover:bg-muted"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
