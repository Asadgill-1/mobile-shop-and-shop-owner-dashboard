import Link from "next/link";
import { Download, HandCoins, Inbox, Plus, ReceiptText, Search } from "lucide-react";
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { fmtDubai } from "@/lib/period";
import { aed, orderNet } from "@/lib/money";
import { orderRef, type OrderRow, type PriceRequestRow } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, StatusPill } from "@/components/ui";
import { ConfirmRejectButtons } from "@/components/order-actions";
import { PriceActions } from "@/components/price-actions";

const STATUSES = ["draft", "pending", "confirmed", "packed", "shipped", "delivered", "cancelled"] as const;

interface Params {
  tab?: string;
  status?: string;
  q?: string;
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [{ tab = "all", status, q }, scope] = await Promise.all([searchParams, getScope()]);
  const ids = scopedShopIds(scope);
  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));
  const multiShop = ids.length > 1;

  const [draftCountRes, reqCountRes] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).in("shop_id", ids).eq("status", "draft"),
    db.from("price_requests").select("id", { count: "exact", head: true }).in("shop_id", ids).eq("status", "pending"),
  ]);
  const draftCount = draftCountRes.count ?? 0;
  const reqCount = reqCountRes.count ?? 0;

  const tabs = [
    { key: "all", label: "All orders", badge: 0 },
    { key: "drafts", label: "Drafts", badge: draftCount },
    { key: "requests", label: "Price requests", badge: reqCount },
  ];

  return (
    <>
      <PageHeader title="Orders" sub={multiShop ? "All shops" : shopName.get(ids[0])}>
        <a
          href={`/orders/export?period=monthly${status ? `&status=${status}` : ""}`}
          aria-label="Export orders CSV (this month)"
          className="pressable inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface text-sm font-semibold px-3.5 py-2.5 min-h-11"
        >
          <Download className="size-4" strokeWidth={2} aria-hidden />
          CSV
        </a>
        <Link
          href="/orders/new"
          className="pressable inline-flex items-center gap-1.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold px-4 py-2.5 min-h-11"
        >
          <Plus className="size-4" strokeWidth={2} aria-hidden />
          New order
        </Link>
      </PageHeader>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/orders?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`pressable inline-flex items-center gap-2 rounded-xl px-4 py-2.5 min-h-11 text-sm font-semibold whitespace-nowrap ${
              tab === t.key ? "bg-primary text-primary-fg" : "bg-surface border border-border text-subtle"
            }`}
          >
            {t.label}
            {t.badge > 0 ? (
              <span className="rounded-full bg-accent text-accent-fg text-xs font-bold min-w-5 h-5 px-1.5 inline-flex items-center justify-center">
                {t.badge}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      {tab === "drafts" ? (
        <DraftsList ids={ids} shopName={shopName} multiShop={multiShop} />
      ) : tab === "requests" ? (
        <RequestsList ids={ids} shopName={shopName} multiShop={multiShop} />
      ) : (
        <AllOrders ids={ids} shopName={shopName} multiShop={multiShop} status={status} q={q} />
      )}
    </>
  );
}

async function DraftsList({
  ids,
  shopName,
  multiShop,
}: {
  ids: string[];
  shopName: Map<string, string>;
  multiShop: boolean;
}) {
  // Mirror of orders/service.py list_drafts.
  const { data } = await db
    .from("orders")
    .select("*, products(brand,model,color)")
    .in("shop_id", ids)
    .eq("status", "draft")
    .order("order_number");
  const drafts = (data ?? []) as unknown as OrderRow[];

  if (drafts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Inbox}
          title="No pending drafts"
          hint="When the AI assistant takes an order, it lands here for you to confirm."
        />
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {drafts.map((o) => (
        <Card key={o.id} className="p-4 border-warning flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Link href={`/orders/${o.id}`} className="pressable font-display font-semibold hover:text-accent-text">
              {orderRef(o.created_at, o.day_seq, o.order_number)}
            </Link>
            <StatusPill status="draft" />
            {multiShop ? <Badge tone="neutral">{shopName.get(o.shop_id)}</Badge> : null}
            <span className="ml-auto text-xs text-subtle">{fmtDubai(o.created_at)}</span>
          </div>
          <p className="text-sm font-semibold">
            {o.products?.brand} {o.products?.model}
            {o.products?.color ? ` · ${o.products.color}` : ""} ×{o.quantity}
          </p>
          <p className="text-sm text-subtle truncate">
            {o.customer_name} · {o.phone}
          </p>
          <div className="flex items-center gap-2 mb-1">
            <p className="font-display font-semibold tabular">{aed(orderNet(o))}</p>
            {Number(o.discount_amount) > 0 ? (
              <Badge tone="warning">−{aed(o.discount_amount)} discount</Badge>
            ) : null}
          </div>
          <ConfirmRejectButtons orderId={o.id} />
        </Card>
      ))}
    </div>
  );
}

async function RequestsList({
  ids,
  shopName,
  multiShop,
}: {
  ids: string[];
  shopName: Map<string, string>;
  multiShop: boolean;
}) {
  // Mirror of orders/service.py list_price_requests.
  const { data } = await db
    .from("price_requests")
    .select("request_number,shop_id,phone,requested_price,status,created_at,products(brand,model,selling_price)")
    .in("shop_id", ids)
    .eq("status", "pending")
    .order("request_number");
  const reqs = (data ?? []) as unknown as PriceRequestRow[];

  if (reqs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={HandCoins}
          title="No pending price requests"
          hint="When a customer haggles, the AI asks you here before giving any discount."
        />
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {reqs.map((r) => (
        <Card key={r.request_number} className="p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <p className="font-display font-semibold">Request #{r.request_number}</p>
            {multiShop ? <Badge tone="neutral">{shopName.get(r.shop_id)}</Badge> : null}
            <span className="ml-auto text-xs text-subtle">{fmtDubai(r.created_at)}</span>
          </div>
          <p className="text-sm font-semibold">
            {r.products?.brand} {r.products?.model}
          </p>
          <p className="text-sm text-subtle">{r.phone}</p>
          <div className="flex items-center gap-3 mb-1">
            <div>
              <p className="text-xs text-subtle">Offer</p>
              <p className="font-display font-semibold tabular text-accent-text">{aed(r.requested_price)}</p>
            </div>
            <div>
              <p className="text-xs text-subtle">List</p>
              <p className="font-display font-semibold tabular">{aed(r.products?.selling_price)}</p>
            </div>
          </div>
          <PriceActions requestNumber={r.request_number} />
        </Card>
      ))}
    </div>
  );
}

async function AllOrders({
  ids,
  shopName,
  multiShop,
  status,
  q,
}: {
  ids: string[];
  shopName: Map<string, string>;
  multiShop: boolean;
  status?: string;
  q?: string;
}) {
  let query = db
    .from("orders")
    .select("*, products(brand,model,color)")
    .in("shop_id", ids)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status && (STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }
  const term = (q ?? "").trim();
  if (term) {
    if (/^\d+$/.test(term)) {
      query = query.eq("order_number", Number(term));
    } else {
      const safe = term.replace(/[,()%]/g, " ").trim();
      if (safe) query = query.or(`customer_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }
  }
  const { data } = await query;
  const orders = (data ?? []) as unknown as OrderRow[];

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap gap-2" action="/orders" method="get">
        <input type="hidden" name="tab" value="all" />
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <div className="relative flex-1 min-w-52">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-subtle"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Order #, customer or phone"
            aria-label="Search orders"
            className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2.5 min-h-11 text-sm"
          />
        </div>
        <button
          type="submit"
          className="pressable cursor-pointer rounded-xl bg-primary text-primary-fg text-sm font-semibold px-4 min-h-11"
        >
          Search
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        <FilterChip href={`/orders?tab=all${term ? `&q=${encodeURIComponent(term)}` : ""}`} active={!status}>
          All
        </FilterChip>
        {STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={`/orders?tab=all&status=${s}${term ? `&q=${encodeURIComponent(term)}` : ""}`}
            active={status === s}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </FilterChip>
        ))}
      </div>

      {orders.length === 0 ? (
        <Card>
          <EmptyState icon={ReceiptText} title="No orders match" hint="Try a different status or search term." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="pressable grid grid-cols-[auto_1fr_auto] md:grid-cols-[112px_100px_1fr_auto_110px_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted"
                >
                  <p className="font-display font-semibold tabular text-xs md:text-sm">{orderRef(o.created_at, o.day_seq, o.order_number)}</p>
                  <p className="hidden md:block text-sm text-subtle">{fmtDubai(o.created_at)}</p>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {o.products?.brand} {o.products?.model} ×{o.quantity}
                    </p>
                    <p className="text-xs text-subtle truncate">
                      {o.customer_name}
                      {multiShop ? ` · ${shopName.get(o.shop_id)}` : ""}
                    </p>
                  </div>
                  <p className="font-semibold tabular text-right">{aed(orderNet(o))}</p>
                  <div className="hidden md:flex justify-end">
                    <StatusPill status={o.status} />
                  </div>
                  <div className="md:hidden col-span-3 flex items-center gap-2">
                    <StatusPill status={o.status} />
                    <span className="text-xs text-subtle">{fmtDubai(o.created_at)}</span>
                  </div>
                  <span className="hidden md:block" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`pressable inline-flex items-center rounded-full px-3.5 py-2 min-h-10 text-xs font-semibold whitespace-nowrap ${
        active ? "bg-accent text-accent-fg" : "bg-surface border border-border text-subtle"
      }`}
    >
      {children}
    </Link>
  );
}
