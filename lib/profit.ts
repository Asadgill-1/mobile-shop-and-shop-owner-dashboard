// Queries for the Reports page. The arithmetic lives in profit-math.ts so it can be unit-tested
// without a database; this file only fetches the rows and hands them over.
import "server-only";
import { db } from "./db";
import type { Period } from "./period";
import { aggregate, soldOnBounds } from "./profit-math";
import type { ProfitSummary } from "./profit-math";

export type {
  ProfitLine,
  ProfitSummary,
  ProductPerf,
  ShopBreakdown,
} from "./profit-math";

export async function profitSummary(shopIds: string[], period: Period): Promise<ProfitSummary> {
  // sold_on is a DATE holding the Dubai day — compare it against Dubai dates, not UTC instants.
  const sold = soldOnBounds(period);

  const [ordersRes, counterRes, catalogueRes, vatRes, cancelsRes, shopsRes] = await Promise.all([
    db
      .from("orders")
      .select("shop_id,created_at,quantity,selling_price,discount_amount,delivery_fee,products(cost_price,brand,model,tags)")
      .in("shop_id", shopIds)
      .gte("created_at", period.start.toISOString())
      .lt("created_at", period.end.toISOString())
      .neq("status", "cancelled")
      .neq("status", "draft"),
    db
      .from("counter_sales")
      .select("shop_id,sold_on,quantity,sold_price,discount_amount,discrepancy,payment_method,products(cost_price,brand,model)")
      .in("shop_id", shopIds)
      .gte("sold_on", sold.gte)
      .lt("sold_on", sold.lt),
    db
      .from("products")
      .select("brand,model,quantity")
      .in("shop_id", shopIds),
    db
      .from("invoices")
      .select("vat_amount")
      .in("shop_id", shopIds)
      .gte("issued_at", period.start.toISOString())
      .lt("issued_at", period.end.toISOString()),
    db
      .from("orders")
      .select("selling_price")
      .in("shop_id", shopIds)
      .eq("status", "cancelled")
      .gte("created_at", period.start.toISOString())
      .lt("created_at", period.end.toISOString()),
    db.from("shops").select("id,rider_keeps_delivery").in("id", shopIds),
  ]);

  return aggregate({
    orders: (ordersRes.data ?? []) as unknown as Parameters<typeof aggregate>[0]["orders"],
    counter: (counterRes.data ?? []) as unknown as Parameters<typeof aggregate>[0]["counter"],
    catalogue: (catalogueRes.data ?? []) as { brand: string; model: string; quantity: number }[],
    vat: (vatRes.data ?? []) as { vat_amount: string }[],
    cancelled: (cancelsRes.data ?? []) as { selling_price: string }[],
    shops: (shopsRes.data ?? []) as { id: string; rider_keeps_delivery: boolean }[],
  });
}
