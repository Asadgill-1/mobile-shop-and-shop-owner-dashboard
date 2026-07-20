// Orders CSV export — dashboard-side, no bridge (PLAN §3.3 replacement). Scoped to the
// caller's shops; keepers may export their own shop (it's the same data they see on screen),
// and every export is audited so it shows in Shop logs.
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { fmtDubai, parsePeriod } from "@/lib/period";
import { csvResponse, toCsv } from "@/lib/csv";
import { orderRef } from "@/lib/types";
import { audit } from "@/lib/audit";

const STATUSES = ["draft", "pending", "confirmed", "packed", "shipped", "delivered", "cancelled"];

export async function GET(req: Request): Promise<Response> {
  const scope = await getScope();
  const ids = scopedShopIds(scope);
  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("date") || url.searchParams.get("period") || "monthly");
  const status = url.searchParams.get("status");
  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));

  let q = db
    .from("orders")
    .select("shop_id,order_number,day_seq,status,phone,address,quantity,selling_price,discount_amount,delivery_fee,cod_amount,created_at,delivered_at, products(brand,model,color), delivery_persons(name)")
    .in("shop_id", ids)
    .gte("created_at", period.start.toISOString())
    .lt("created_at", period.end.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);
  if (status && STATUSES.includes(status)) q = q.eq("status", status);
  const { data } = await q;

  interface Row {
    shop_id: string; order_number: number | null; day_seq: number | null; status: string;
    phone: string; address: string; quantity: number; selling_price: string;
    discount_amount: string; delivery_fee: string | null; cod_amount: string | null;
    created_at: string; delivered_at: string | null;
    products: { brand: string; model: string; color: string | null } | null;
    delivery_persons: { name: string } | null;
  }
  // "IMEI(s)" is intentionally blank — this doubles as the pick-&-pack sheet; the packer writes the
  // shipped unit's IMEI in it, then enters it at invoice time (product_units flips sold).
  const csv = toCsv(
    ["Order", "Created (Dubai)", "Status", "Shop", "Customer phone", "Address", "Product", "Qty", "IMEI(s)", "Total AED", "Discount AED", "Delivery AED", "COD AED", "Rider", "Delivered (Dubai)"],
    ((data ?? []) as unknown as Row[]).map((o) => {
      const p = o.products;
      const rider = o.delivery_persons;
      return [
        orderRef(o.created_at, o.day_seq, o.order_number), fmtDubai(o.created_at), o.status, shopName.get(o.shop_id) ?? "",
        o.phone, o.address, `${p?.brand ?? ""} ${p?.model ?? ""}${p?.color ? ` ${p.color}` : ""}`.trim(),
        o.quantity, "", o.selling_price, o.discount_amount, o.delivery_fee ?? "", o.cod_amount ?? "",
        rider?.name ?? "", o.delivered_at ? fmtDubai(o.delivered_at) : "",
      ];
    }),
  );

  await audit(`dashboard:${scope.email}`, "exportorders_cmd", ids.length === 1 ? ids[0] : null, {
    text: `${period.key}${status ? ` ${status}` : ""}`,
  });
  return csvResponse(`orders-${period.key}${status ? `-${status}` : ""}.csv`, csv);
}
