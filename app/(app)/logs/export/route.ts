// Shop logs CSV — owner-only, mirrors the /logs page's three views. No bridge:
// the dashboard reads the DB directly and streams the file itself (PLAN §3.3 replacement).
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { dubaiDateISO, fmtDubai, parsePeriod } from "@/lib/period";
import { actorName, changeLines, humanize } from "@/lib/activity";
import { csvResponse, toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";
import type { AuditRow } from "@/lib/types";

export async function GET(req: Request): Promise<Response> {
  const scope = await getScope();
  if (scope.role !== "owner") return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "activity";
  const period = parsePeriod(url.searchParams.get("date") || url.searchParams.get("period") || "today");
  const ids = scopedShopIds(scope);
  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));
  const start = period.start.toISOString();
  const end = period.end.toISOString();

  let csv: string;
  if (view === "cancels") {
    const { data } = await db
      .from("orders")
      .select("shop_id,order_number,quantity,selling_price,cancel_remarks,created_at, products(brand,model), order_status_history(status,changed_by,changed_at)")
      .in("shop_id", ids).eq("status", "cancelled")
      .gte("created_at", start).lt("created_at", end)
      .order("created_at", { ascending: false });
    interface Row {
      shop_id: string; order_number: number | null; quantity: number; selling_price: string;
      cancel_remarks: string | null; created_at: string;
      products: { brand: string; model: string } | null;
      order_status_history: { status: string; changed_by: string | null; changed_at: string }[];
    }
    csv = toCsv(
      ["Time (Dubai)", "Shop", "Order", "Product", "Qty", "Total AED", "Remark", "By"],
      ((data ?? []) as unknown as Row[]).map((o) => {
        const p = o.products;
        const hist = o.order_status_history.find((h) => h.status === "cancelled");
        return [
          fmtDubai(hist?.changed_at ?? o.created_at), shopName.get(o.shop_id) ?? "",
          o.order_number, `${p?.brand ?? ""} ${p?.model ?? ""}`.trim(), o.quantity,
          o.selling_price, o.cancel_remarks ?? hist?.changed_by ?? "", hist?.changed_by ?? "",
        ];
      }),
    );
  } else if (view === "discounts") {
    // Both channels, same as the page: the bot's bargaining and the till's knock-offs (030).
    const [ordersRes, counterRes] = await Promise.all([
      db
        .from("orders")
        .select("shop_id,order_number,quantity,selling_price,discount_amount,status,created_at, products(brand,model)")
        .in("shop_id", ids).neq("status", "draft").gt("discount_amount", 0)
        .gte("created_at", start).lt("created_at", end),
      db
        .from("counter_sales")
        .select("shop_id,quantity,sold_price,discount_amount,sold_by,created_at, products(brand,model)")
        .in("shop_id", ids).gt("discount_amount", 0)
        .gte("sold_on", dubaiDateISO(period.start)).lt("sold_on", dubaiDateISO(period.end)),
    ]);
    interface Row {
      shop_id: string; order_number: number | null; quantity: number; selling_price: string;
      discount_amount: string; status: string; created_at: string;
      products: { brand: string; model: string } | null;
    }
    interface CRow {
      shop_id: string; quantity: number; sold_price: string; discount_amount: string;
      sold_by: string | null; created_at: string;
      products: { brand: string; model: string } | null;
    }
    const label = (p: { brand: string; model: string } | null) =>
      `${p?.brand ?? ""} ${p?.model ?? ""}`.trim();
    const rows: (string | number | null)[][] = [
      ...((ordersRes.data ?? []) as unknown as Row[]).map((o) => [
        o.created_at, "Online sale", shopName.get(o.shop_id) ?? "", String(o.order_number ?? ""),
        label(o.products), o.quantity, o.selling_price, o.discount_amount, o.status,
      ]),
      ...((counterRes.data ?? []) as unknown as CRow[]).map((r) => [
        r.created_at, "Counter sale", shopName.get(r.shop_id) ?? "", "",
        label(r.products), r.quantity,
        (Number(r.sold_price) * r.quantity).toFixed(2), r.discount_amount,
        r.sold_by ?? "counter",
      ]),
    ].sort((a, b) => (String(a[0]) < String(b[0]) ? 1 : -1));
    csv = toCsv(
      ["Time (Dubai)", "Channel", "Shop", "Order", "Product", "Qty", "Total AED", "Discount AED", "Status / by"],
      rows.map(([at, ...rest]) => [fmtDubai(String(at)), ...rest]),
    );
  } else {
    const [logsRes, keepersRes, ridersRes] = await Promise.all([
      db.from("audit_logs").select("id,shop_id,actor,action,detail,created_at")
        .in("shop_id", ids).gte("created_at", start).lt("created_at", end)
        .order("created_at", { ascending: false }).limit(2000),
      db.from("shopkeepers").select("telegram_id,name").in("shop_id", ids),
      db.from("delivery_persons").select("telegram_id,name").in("shop_id", ids),
    ]);
    const names: Record<string, string> = {};
    for (const r of [...(keepersRes.data ?? []), ...(ridersRes.data ?? [])]) {
      if (r.telegram_id != null) names[String(r.telegram_id)] = r.name;
    }
    csv = toCsv(
      ["Time (Dubai)", "Shop", "Actor", "Action", "Description", "Changes"],
      ((logsRes.data ?? []) as AuditRow[]).map((r) => [
        fmtDubai(r.created_at),
        r.shop_id ? shopName.get(r.shop_id) ?? "" : "",
        actorName(r.actor, names),
        r.action,
        humanize(r),
        changeLines(r).join("; "),
      ]),
    );
  }

  await audit(`dashboard:${scope.email}`, "exportorders_cmd", ids.length === 1 ? ids[0] : null, {
    text: `shop logs ${view} ${period.key}`,
  });
  return csvResponse(`shop-logs-${view}-${period.key}.csv`, csv);
}
