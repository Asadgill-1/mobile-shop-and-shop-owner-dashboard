import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bike,
  CircleCheck,
  CircleDashed,
  CircleX,
  MapPin,
  Phone,
  StickyNote,
} from "lucide-react";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { fmtDubai } from "@/lib/period";
import { aed, num, orderNet } from "@/lib/money";
import type { OrderRow, StatusHistoryRow } from "@/lib/types";
import { Badge, Card, PageHeader, SectionTitle, StatusPill } from "@/components/ui";

const custodyLabel = {
  none: null,
  offered: { tone: "warning" as const, text: "Pickup offered — rider hasn't confirmed" },
  accepted: { tone: "accent" as const, text: "Pickup confirmed by rider" },
  disputed: { tone: "destructive" as const, text: "PICKUP DISPUTED — rider says not received" },
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, scope] = await Promise.all([params, getScope()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // Tenant guard in the query itself: a foreign shop's order is the same 404
  // as a nonexistent one (mirror of the bot's _own_shop semantics).
  const { data } = await db
    .from("orders")
    .select("*, products(brand,model,color), order_status_history(status,changed_at,changed_by)")
    .eq("id", id)
    .in("shop_id", scope.shopIds)
    .maybeSingle();
  if (!data) notFound();
  const order = data as unknown as OrderRow & { order_status_history: StatusHistoryRow[] };

  const rider = order.rider_id
    ? (await db.from("delivery_persons").select("name,phone").eq("id", order.rider_id).maybeSingle()).data
    : null;

  const history = [...(order.order_status_history ?? [])].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
  );
  const custody = custodyLabel[order.custody ?? "none"];
  const shopName = scope.shops.find((s) => s.id === order.shop_id)?.name;

  return (
    <>
      <div className="flex items-center gap-3">
        <Link
          href="/orders"
          aria-label="Back to orders"
          className="pressable rounded-xl border border-border bg-surface p-2.5 min-w-11 min-h-11 flex items-center justify-center"
        >
          <ArrowLeft className="size-5" strokeWidth={2} aria-hidden />
        </Link>
        <PageHeader title={`Order #${order.order_number}`} sub={shopName}>
          <StatusPill status={order.status} />
        </PageHeader>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 flex flex-col gap-3">
          <SectionTitle>Order</SectionTitle>
          <p className="font-display text-lg font-semibold">
            {order.products?.brand} {order.products?.model}
            {order.products?.color ? ` · ${order.products.color}` : ""} ×{order.quantity}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-subtle">List total</p>
              <p className="font-semibold tabular">{aed(order.selling_price)}</p>
            </div>
            <div>
              <p className="text-xs text-subtle">Discount</p>
              <p className="font-semibold tabular">
                {num(order.discount_amount) > 0 ? `−${aed(order.discount_amount)}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-subtle">Charge</p>
              <p className="font-display font-semibold tabular text-accent-text">{aed(orderNet(order))}</p>
            </div>
          </div>
          <hr className="border-border" />
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">{order.customer_name}</p>
            <a href={`tel:${order.phone}`} className="flex items-center gap-2 text-subtle">
              <Phone className="size-4" strokeWidth={2} aria-hidden />
              {order.phone}
            </a>
            <p className="flex items-start gap-2 text-subtle">
              <MapPin className="size-4 mt-0.5 shrink-0" strokeWidth={2} aria-hidden />
              {order.address}
            </p>
            {order.delivery_date ? (
              <p className="text-subtle">Delivery date: {order.delivery_date}</p>
            ) : null}
            {order.special_instructions ? (
              <p className="flex items-start gap-2 text-subtle">
                <StickyNote className="size-4 mt-0.5 shrink-0" strokeWidth={2} aria-hidden />
                {order.special_instructions}
              </p>
            ) : null}
          </div>
          {order.status === "cancelled" && order.cancel_remarks ? (
            <p className="rounded-xl bg-destructive-soft text-destructive-text text-sm font-semibold px-3 py-2">
              Cancelled: {order.cancel_remarks}
            </p>
          ) : null}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-4 flex flex-col gap-3">
            <SectionTitle>Delivery</SectionTitle>
            {order.rider_id ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-info-soft text-info-text p-2.5">
                    <Bike className="size-5" strokeWidth={2} aria-hidden />
                  </div>
                  <div>
                    <p className="font-semibold">{rider?.name ?? "Rider"}</p>
                    <p className="text-sm text-subtle">{rider?.phone}</p>
                  </div>
                </div>
                {custody ? <Badge tone={custody.tone}>{custody.text}</Badge> : null}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-subtle">COD to collect</p>
                    <p className="font-semibold tabular">
                      {order.cod_amount != null ? aed(order.cod_amount) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-subtle">Cash received</p>
                    <p className="font-semibold tabular">
                      {order.cash_received != null ? aed(order.cash_received) : "—"}
                    </p>
                  </div>
                </div>
                {order.delivered_at ? (
                  <p className="text-sm text-subtle">Delivered {fmtDubai(order.delivered_at)}</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-subtle">No rider assigned yet.</p>
            )}
          </Card>

          <Card className="p-4 flex flex-col gap-3">
            <SectionTitle>Timeline</SectionTitle>
            {history.length === 0 ? (
              <p className="text-sm text-subtle">No history recorded.</p>
            ) : (
              <ol className="flex flex-col gap-0">
                {history.map((h, i) => {
                  const Icon =
                    h.status === "cancelled" ? CircleX : i === history.length - 1 ? CircleCheck : CircleDashed;
                  const color =
                    h.status === "cancelled"
                      ? "text-destructive-text"
                      : i === history.length - 1
                        ? "text-accent-text"
                        : "text-subtle";
                  return (
                    <li key={`${h.status}-${h.changed_at}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <Icon className={`size-5 ${color}`} strokeWidth={2} aria-hidden />
                        {i < history.length - 1 ? <div className="w-px flex-1 bg-border my-1" aria-hidden /> : null}
                      </div>
                      <div className="pb-4">
                        <p className="text-sm font-semibold capitalize">{h.status}</p>
                        <p className="text-xs text-subtle">
                          {fmtDubai(h.changed_at)}
                          {h.changed_by ? ` · ${h.changed_by}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
