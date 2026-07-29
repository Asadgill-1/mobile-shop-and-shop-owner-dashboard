// The money math, split out of profit.ts so it can be tested without a database.
// profit.ts owns the queries; everything below is pure — rows in, summary out.
//
// Port of orders/service.py profit math (_aggregate + merge_counter), verified against the Python:
// cancelled + draft orders excluded, counter sales folded in (per-unit sold_price, discrepancy rows
// excluded), top products merged across both channels.
// .ts specifiers so `node --test` resolves these directly (Node ESM needs the extension);
// tsconfig has allowImportingTsExtensions, and the bundler resolves them unchanged.
import { num } from "./money.ts";
import { dubaiDateISO } from "./period.ts";
import type { Period } from "./period.ts";

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
  onlineRevenue: number;
  onlineProfit: number;
  daily: { day: string; revenue: number }[]; // Dubai days, ascending
  perShop: ShopBreakdown[];
  payment: { cash: number; card: number; unspecified: number }; // counter (POS) AED
  products: ProductPerf[]; // whole catalogue, sold-first; stock left per line
  vatCollected: number; // Σ invoices.vat_amount issued in the period
  cancels: { count: number; value: number };
  discountCount: number; // sales with a discount in the period — online orders AND POS rows
  deliveryCollected: number; // Σ delivery_fee on non-cancelled orders (023)
  deliveryKept: number; // portion riders kept (shops with rider_keeps_delivery)
}

export interface OrderProfitRow {
  shop_id: string;
  created_at: string;
  quantity: number;
  selling_price: string;
  discount_amount: string;
  delivery_fee: string | null;
  products: { cost_price: string; brand: string; model: string; tags: string[] } | null;
}

export interface CounterProfitRow {
  shop_id: string;
  sold_on: string;
  quantity: number;
  sold_price: string;
  /** POS giveaway on this row (030). Negative on a void, so voided discounts net out. */
  discount_amount: string;
  discrepancy: boolean;
  payment_method: "cash" | "card" | null;
  products: { cost_price: string; brand: string; model: string } | null;
}

export interface AggregateInput {
  orders: OrderProfitRow[];
  counter: CounterProfitRow[];
  catalogue: { brand: string; model: string; quantity: number }[];
  vat: { vat_amount: string }[];
  cancelled: { selling_price: string }[];
  shops: { id: string; rider_keeps_delivery: boolean }[];
}

/** line_profit from orders/models.py: (sell − disc) − cost × qty. sell is the line TOTAL. */
function lineProfit(sell: number, disc: number, costUnit: number, qty: number): number {
  return sell - disc - costUnit * qty;
}

/**
 * The `sold_on` bounds for a period. counter_sales.sold_on is a plain DATE holding the Dubai day,
 * so it must be compared against Dubai dates — NOT against period.start.toISOString(), which is a
 * UTC instant and reads 20:00 the previous day (Dubai is UTC+4). Getting this wrong shifts every
 * counter figure one day earlier while the online figures beside it stay correct.
 */
export function soldOnBounds(period: Period): { gte: string; lt: string } {
  return { gte: dubaiDateISO(period.start), lt: dubaiDateISO(period.end) };
}

export function aggregate(input: AggregateInput): ProfitSummary {
  const { orders, catalogue, vat, cancelled, shops } = input;
  // Discrepancy rows excluded: no stock moved, counting them would inflate profit with the very
  // thing the system flagged (counter_sales.py counter_totals).
  const counter = input.counter.filter((r) => !r.discrepancy);

  const keepsDelivery = new Map(shops.map((s) => [s.id, s.rider_keeps_delivery]));

  let onlineRevenue = 0, discounts = 0, cost = 0, profit = 0, clearance = 0, discountCount = 0;
  let deliveryCollected = 0, deliveryKept = 0;
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
    const fee = num(o.delivery_fee);
    const kept = fee > 0 && keepsDelivery.get(o.shop_id) ? fee : 0;
    // Revenue is GROSS sales plus the delivery cash the shop keeps; `discounts` is reported beside
    // it, so net = revenue − discounts. Gross matches orders/service.py::_aggregate, which is what
    // the shopkeeper's /profit prints — the two must not disagree. Migration 023: when
    // rider_keeps_delivery is set the fee is the rider's earning and was never the shop's money.
    const net = sell + (fee - kept);

    onlineRevenue += net;
    discounts += disc;
    cost += cp * qty;
    profit += pr;
    if (disc > 0) discountCount++;
    if ((p?.tags ?? []).includes("clearance")) clearance += pr;
    if (fee > 0) {
      deliveryCollected += fee;
      deliveryKept += kept;
    }

    addProduct(`${p?.brand ?? "?"} ${p?.model ?? "?"}`.trim(), qty, sell, pr);
    addShop(o.shop_id, net, pr);
    const day = dubaiDateISO(new Date(o.created_at));
    byDay.set(day, (byDay.get(day) ?? 0) + net);
  }

  let counterRevenue = 0, counterProfit = 0, counterCost = 0;
  const payment = { cash: 0, card: 0, unspecified: 0 };
  for (const r of counter) {
    const p = r.products;
    const qty = r.quantity;
    const sell = num(r.sold_price) * qty; // sold_price is PER UNIT, gross, ex-VAT
    const disc = num(r.discount_amount);
    const cp = num(p?.cost_price);
    const pr = lineProfit(sell, disc, cp, qty);

    counterRevenue += sell;
    counterCost += cp * qty;
    counterProfit += pr;
    // Counter giveaways report exactly like online ones: revenue stays GROSS and the discount sits
    // beside it, so net = revenue − discounts holds across both channels.
    discounts += disc;
    if (disc > 0) discountCount++;
    // Voids are reversing rows (negative qty) carrying the ORIGINAL tender, so they net out inside
    // their own bucket. A void with a null method would leave the sale's cash standing.
    payment[r.payment_method ?? "unspecified"] += sell;

    addProduct(`${p?.brand ?? "?"} ${p?.model ?? "?"}`.trim(), qty, sell, pr);
    addShop(r.shop_id, sell, pr);
    byDay.set(r.sold_on, (byDay.get(r.sold_on) ?? 0) + sell);
  }

  // Whole-catalogue performance: unsold products surface with zeros (product_stats port).
  const stockByLabel = new Map<string, number>();
  for (const p of catalogue) {
    const label = `${p.brand} ${p.model}`.trim();
    stockByLabel.set(label, (stockByLabel.get(label) ?? 0) + p.quantity);
  }
  const products: ProductPerf[] = [...stockByLabel.entries()].map(([label, stock]) => {
    const sold = byProduct.get(label);
    return { label, qty: sold?.qty ?? 0, revenue: sold?.revenue ?? 0, profit: sold?.profit ?? 0, stock };
  });
  products.sort((a, b) => b.revenue - a.revenue || b.stock - a.stock);

  const totalRevenue = onlineRevenue + counterRevenue;
  const totalProfit = profit + counterProfit;

  return {
    // Voids are reversing rows; counting them would report a refunded sale as two sales.
    orders: orders.length + counter.filter((r) => r.quantity > 0).length,
    revenue: totalRevenue,
    discounts,
    cost: cost + counterCost,
    profit: totalProfit,
    clearanceProfit: clearance,
    counterRevenue,
    counterProfit,
    top: [...byProduct.values()].sort((a, b) => b.profit - a.profit).slice(0, 5),
    margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    onlineRevenue,
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
    vatCollected: vat.reduce((s, i) => s + num(i.vat_amount), 0),
    cancels: {
      count: cancelled.length,
      value: cancelled.reduce((s, o) => s + num(o.selling_price), 0),
    },
    discountCount,
    deliveryCollected,
    deliveryKept,
  };
}
