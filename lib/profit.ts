// Port of orders/service.py profit math (_aggregate + merge_counter), verified against
// the Python: cancelled + draft orders excluded, counter sales folded in (per-unit
// sold_price, discrepancy rows excluded), top products merged across both channels.
// P4 extends the same pass with the analytics the Reports page shows: daily trend,
// per-shop breakdown, channel/payment splits, product performance, VAT, cancels.
import "server-only";
import { db } from "./db";
import { num } from "./money";
import { dubaiDateISO } from "./period";
import type { Period } from "./period";

export interface ProfitLine {
  label: string;
  qty: number;
  revenue: number;
  profit: number;
}

export interface ShopBreakdown {
  shopId: string;
  orders: number;
  revenue: number;
  profit: number;
  margin: number; // %
}

export interface ProductPerf {
  label: string;
  qty: number;
  revenue: number;
  profit: number;
  stock: number;
}

export interface ProfitSummary {
  orders: number;
  revenue: number;
  discounts: number;
  cost: number;
  profit: number;
  clearanceProfit: number;
  counterRevenue: number;
  counterProfit: number;
  top: ProfitLine[];
  margin: number; // %
  // P4 analytics
  onlineRevenue: number;
  onlineProfit: number;
  daily: { day: string; revenue: number }[]; // Dubai days, ascending
  perShop: ShopBreakdown[];
  payment: { cash: number; card: number; unspecified: number }; // counter (POS) AED
  products: ProductPerf[]; // whole catalogue, sold-first; stock left per line
  vatCollected: number; // Σ invoices.vat_amount issued in the period
  cancels: { count: number; value: number };
  discountCount: number; // non-cancelled orders with a discount in the period
}

interface OrderProfitRow {
  shop_id: string;
  created_at: string;
  quantity: number;
  selling_price: string;
  discount_amount: string;
  products: { cost_price: string; brand: string; model: string; tags: string[] } | null;
}

interface CounterProfitRow {
  shop_id: string;
  sold_on: string;
  quantity: number;
  sold_price: string;
  discrepancy: boolean;
  payment_method: "cash" | "card" | null;
  products: { cost_price: string; brand: string; model: string } | null;
}

/** line_profit from orders/models.py: (sell − disc) − cost × qty. sell is the line TOTAL. */
function lineProfit(sell: number, disc: number, costUnit: number, qty: number): number {
  return sell - disc - costUnit * qty;
}

export async function profitSummary(shopIds: string[], period: Period): Promise<ProfitSummary> {
  const [ordersRes, counterRes, catalogueRes, vatRes, cancelsRes] = await Promise.all([
    db
      .from("orders")
      .select("shop_id,created_at,quantity,selling_price,discount_amount,products(cost_price,brand,model,tags)")
      .in("shop_id", shopIds)
      .gte("created_at", period.start.toISOString())
      .lt("created_at", period.end.toISOString())
      .neq("status", "cancelled")
      .neq("status", "draft"),
    db
      .from("counter_sales")
      .select("shop_id,sold_on,quantity,sold_price,discrepancy,payment_method,products(cost_price,brand,model)")
      .in("shop_id", shopIds)
      .gte("sold_on", period.start.toISOString().slice(0, 10))
      .lt("sold_on", period.end.toISOString().slice(0, 10)),
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
  ]);

  const orders = (ordersRes.data ?? []) as unknown as OrderProfitRow[];
  // Discrepancy rows excluded: no stock moved, counting them would inflate profit
  // with the very thing the system flagged (counter_sales.py counter_totals).
  const counter = ((counterRes.data ?? []) as unknown as CounterProfitRow[]).filter(
    (r) => !r.discrepancy,
  );

  let revenue = 0, discounts = 0, cost = 0, profit = 0, clearance = 0, discountCount = 0;
  const byProduct = new Map<string, ProfitLine>();
  const byDay = new Map<string, number>();
  const byShop = new Map<string, { orders: number; revenue: number; profit: number }>();

  const addProduct = (label: string, qty: number, rev: number, pr: number) => {
    const prev = byProduct.get(label);
    byProduct.set(label, {
      label,
      qty: (prev?.qty ?? 0) + qty,
      revenue: (prev?.revenue ?? 0) + rev,
      profit: (prev?.profit ?? 0) + pr,
    });
  };
  const addShop = (shopId: string, rev: number, pr: number) => {
    const prev = byShop.get(shopId) ?? { orders: 0, revenue: 0, profit: 0 };
    byShop.set(shopId, { orders: prev.orders + 1, revenue: prev.revenue + rev, profit: prev.profit + pr });
  };

  for (const o of orders) {
    const p = o.products;
    const sell = num(o.selling_price);
    const disc = num(o.discount_amount);
    const cp = num(p?.cost_price);
    const qty = o.quantity;
    const pr = lineProfit(sell, disc, cp, qty);

    revenue += sell;
    discounts += disc;
    cost += cp * qty;
    profit += pr;
    if (disc > 0) discountCount++;
    if ((p?.tags ?? []).includes("clearance")) clearance += pr;

    addProduct(`${p?.brand ?? "?"} ${p?.model ?? "?"}`.trim(), qty, sell - disc, pr);
    addShop(o.shop_id, sell, pr);
    const day = dubaiDateISO(new Date(o.created_at));
    byDay.set(day, (byDay.get(day) ?? 0) + sell);
  }

  let counterRevenue = 0, counterProfit = 0, counterCost = 0;
  const payment = { cash: 0, card: 0, unspecified: 0 };
  for (const r of counter) {
    const p = r.products;
    const qty = r.quantity;
    const sell = num(r.sold_price) * qty; // sold_price is PER UNIT
    const cp = num(p?.cost_price);
    const pr = lineProfit(sell, 0, cp, qty);

    counterRevenue += sell;
    counterCost += cp * qty;
    counterProfit += pr;
    payment[r.payment_method ?? "unspecified"] += sell; // voids net out (negative qty)

    addProduct(`${p?.brand ?? "?"} ${p?.model ?? "?"}`.trim(), qty, sell, pr);
    addShop(r.shop_id, sell, pr);
    byDay.set(r.sold_on, (byDay.get(r.sold_on) ?? 0) + sell);
  }

  // Whole-catalogue performance: unsold products surface with zeros (product_stats port).
  const stockByLabel = new Map<string, number>();
  for (const p of (catalogueRes.data ?? []) as { brand: string; model: string; quantity: number }[]) {
    const label = `${p.brand} ${p.model}`.trim();
    stockByLabel.set(label, (stockByLabel.get(label) ?? 0) + p.quantity);
  }
  const products: ProductPerf[] = [...stockByLabel.entries()].map(([label, stock]) => {
    const sold = byProduct.get(label);
    return { label, qty: sold?.qty ?? 0, revenue: sold?.revenue ?? 0, profit: sold?.profit ?? 0, stock };
  });
  products.sort((a, b) => b.revenue - a.revenue || b.stock - a.stock);

  const totalRevenue = revenue + counterRevenue;
  const totalProfit = profit + counterProfit;
  const top = [...byProduct.values()].sort((a, b) => b.profit - a.profit).slice(0, 5);
  const cancelRows = (cancelsRes.data ?? []) as { selling_price: string }[];

  return {
    orders: orders.length + counter.length,
    revenue: totalRevenue,
    discounts,
    cost: cost + counterCost,
    profit: totalProfit,
    clearanceProfit: clearance,
    counterRevenue,
    counterProfit,
    top,
    margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    onlineRevenue: revenue,
    onlineProfit: profit,
    daily: [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, rev]) => ({ day, revenue: rev })),
    perShop: [...byShop.entries()]
      .map(([shopId, s]) => ({
        shopId,
        orders: s.orders,
        revenue: s.revenue,
        profit: s.profit,
        margin: s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    payment,
    products,
    vatCollected: ((vatRes.data ?? []) as { vat_amount: string }[]).reduce((s, i) => s + num(i.vat_amount), 0),
    cancels: {
      count: cancelRows.length,
      value: cancelRows.reduce((s, o) => s + num(o.selling_price), 0),
    },
    discountCount,
  };
}
