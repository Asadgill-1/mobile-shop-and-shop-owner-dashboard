// Port of orders/service.py profit math (_aggregate + merge_counter), verified against
// the Python: cancelled + draft orders excluded, counter sales folded in (per-unit
// sold_price, discrepancy rows excluded), top products merged across both channels.
import "server-only";
import { db } from "./db";
import { num } from "./money";
import type { Period } from "./period";

export interface ProfitLine {
  label: string;
  qty: number;
  profit: number;
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
}

interface OrderProfitRow {
  quantity: number;
  selling_price: string;
  discount_amount: string;
  products: { cost_price: string; brand: string; model: string; tags: string[] } | null;
}

interface CounterProfitRow {
  quantity: number;
  sold_price: string;
  discrepancy: boolean;
  products: { cost_price: string; brand: string; model: string } | null;
}

/** line_profit from orders/models.py: (sell − disc) − cost × qty. sell is the line TOTAL. */
function lineProfit(sell: number, disc: number, costUnit: number, qty: number): number {
  return sell - disc - costUnit * qty;
}

export async function profitSummary(shopIds: string[], period: Period): Promise<ProfitSummary> {
  const [ordersRes, counterRes] = await Promise.all([
    db
      .from("orders")
      .select("quantity,selling_price,discount_amount,products(cost_price,brand,model,tags)")
      .in("shop_id", shopIds)
      .gte("created_at", period.start.toISOString())
      .lt("created_at", period.end.toISOString())
      .neq("status", "cancelled")
      .neq("status", "draft"),
    db
      .from("counter_sales")
      .select("quantity,sold_price,discrepancy,products(cost_price,brand,model)")
      .in("shop_id", shopIds)
      .gte("sold_on", period.start.toISOString().slice(0, 10))
      .lt("sold_on", period.end.toISOString().slice(0, 10)),
  ]);

  const orders = (ordersRes.data ?? []) as unknown as OrderProfitRow[];
  // Discrepancy rows excluded: no stock moved, counting them would inflate profit
  // with the very thing the system flagged (counter_sales.py counter_totals).
  const counter = ((counterRes.data ?? []) as unknown as CounterProfitRow[]).filter(
    (r) => !r.discrepancy,
  );

  let revenue = 0, discounts = 0, cost = 0, profit = 0, clearance = 0;
  const byProduct = new Map<string, ProfitLine>();

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
    if ((p?.tags ?? []).includes("clearance")) clearance += pr;

    const label = `${p?.brand ?? "?"} ${p?.model ?? "?"}`.trim();
    const prev = byProduct.get(label);
    byProduct.set(label, { label, qty: (prev?.qty ?? 0) + qty, profit: (prev?.profit ?? 0) + pr });
  }

  let counterRevenue = 0, counterProfit = 0, counterCost = 0;
  for (const r of counter) {
    const p = r.products;
    const qty = r.quantity;
    const sell = num(r.sold_price) * qty; // sold_price is PER UNIT
    const cp = num(p?.cost_price);
    const pr = lineProfit(sell, 0, cp, qty);

    counterRevenue += sell;
    counterCost += cp * qty;
    counterProfit += pr;

    const label = `${p?.brand ?? "?"} ${p?.model ?? "?"}`.trim();
    const prev = byProduct.get(label);
    byProduct.set(label, { label, qty: (prev?.qty ?? 0) + qty, profit: (prev?.profit ?? 0) + pr });
  }

  const totalRevenue = revenue + counterRevenue;
  const totalProfit = profit + counterProfit;
  const top = [...byProduct.values()].sort((a, b) => b.profit - a.profit).slice(0, 5);

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
  };
}
