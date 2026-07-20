// Rider deliveries CSV — assigned orders in the period, with COD amounts. Dashboard-side,
// no bridge; the bot's XLSX route sheet remains for riders themselves.
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { fmtDubai, parsePeriod } from "@/lib/period";
import { csvResponse, toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";

export async function GET(req: Request): Promise<Response> {
  const scope = await getScope();
  const ids = scopedShopIds(scope);
  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("date") || url.searchParams.get("period") || "monthly");
  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));

  const { data } = await db
    .from("orders")
    .select("shop_id,order_number,status,phone,address,quantity,selling_price,cod_amount,custody,created_at,delivered_at, products(brand,model), delivery_persons(name,phone)")
    .in("shop_id", ids)
    .not("rider_id", "is", null)
    .gte("created_at", period.start.toISOString())
    .lt("created_at", period.end.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);

  interface Row {
    shop_id: string; order_number: number | null; status: string; phone: string; address: string;
    quantity: number; selling_price: string; cod_amount: string | null; custody: string | null;
    created_at: string; delivered_at: string | null;
    products: { brand: string; model: string } | null;
    delivery_persons: { name: string; phone: string | null } | null;
  }
  const csv = toCsv(
    ["Rider", "Rider phone", "Order", "Status", "Shop", "Customer phone", "Address", "Product", "Qty", "COD AED", "Custody", "Created (Dubai)", "Delivered (Dubai)"],
    ((data ?? []) as unknown as Row[]).map((o) => {
      const p = o.products;
      const rider = o.delivery_persons;
      return [
        rider?.name ?? "", rider?.phone ?? "", o.order_number, o.status,
        shopName.get(o.shop_id) ?? "", o.phone, o.address,
        `${p?.brand ?? ""} ${p?.model ?? ""}`.trim(), o.quantity,
        o.cod_amount ?? "", o.custody ?? "", fmtDubai(o.created_at),
        o.delivered_at ? fmtDubai(o.delivered_at) : "",
      ];
    }),
  );

  await audit(`dashboard:${scope.email}`, "exportrider_cmd", ids.length === 1 ? ids[0] : null, {
    text: period.key,
  });
  return csvResponse(`rider-deliveries-${period.key}.csv`, csv);
}
