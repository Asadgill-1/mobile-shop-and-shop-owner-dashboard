// Run: node --test lib/profit-math.test.ts   (Node 24 strips the types natively — no test dep)
//
// Every case here failed against the pre-fix implementation. They pin the four money bugs that
// made the Reports page disagree with reality, so a future edit cannot quietly reintroduce them.
import { test } from "node:test";
import assert from "node:assert/strict";

import { parsePeriod } from "./period.ts";
import { aggregate, soldOnBounds } from "./profit-math.ts";
import type { AggregateInput, CounterProfitRow, OrderProfitRow } from "./profit-math.ts";

const SHOP = "shop-1";

function input(over: Partial<AggregateInput> = {}): AggregateInput {
  return {
    orders: [],
    counter: [],
    catalogue: [],
    vat: [],
    cancelled: [],
    shops: [{ id: SHOP, rider_keeps_delivery: false }],
    ...over,
  };
}

function order(over: Partial<OrderProfitRow> = {}): OrderProfitRow {
  return {
    shop_id: SHOP,
    created_at: "2026-07-28T09:00:00.000Z",
    quantity: 1,
    selling_price: "1000",
    discount_amount: "0",
    delivery_fee: null,
    products: { cost_price: "600", brand: "Acme", model: "One", tags: [] },
    ...over,
  };
}

function sale(over: Partial<CounterProfitRow> = {}): CounterProfitRow {
  return {
    shop_id: SHOP,
    sold_on: "2026-07-28",
    quantity: 1,
    sold_price: "1000",
    discount_amount: "0",
    discrepancy: false,
    payment_method: "cash",
    products: { cost_price: "600", brand: "Acme", model: "One" },
    ...over,
  };
}

// ── D1: the counter-sales window must be the Dubai day, not the UTC day ──────────────────────
// Dubai is UTC+4, so Dubai midnight is 20:00 the PREVIOUS day in UTC. Slicing the ISO string of
// period.start therefore names yesterday, and the report shows yesterday's takings as today's.
test("D1: sold_on bounds are the Dubai day, not a UTC slice of the instant", () => {
  const period = parsePeriod("2026-07-28");

  assert.deepEqual(soldOnBounds(period), { gte: "2026-07-28", lt: "2026-07-29" });

  // The old implementation did exactly this — kept here so the regression is unmistakable.
  const naive = {
    gte: period.start.toISOString().slice(0, 10),
    lt: period.end.toISOString().slice(0, 10),
  };
  assert.deepEqual(naive, { gte: "2026-07-27", lt: "2026-07-28" }, "the shifted window we fixed");
  assert.notDeepEqual(soldOnBounds(period), naive);
});

test("D1: every period keeps its start bound on the Dubai date", () => {
  for (const key of ["today", "yesterday", "weekly", "monthly"]) {
    const p = parsePeriod(key);
    const bounds = soldOnBounds(p);
    // start is Dubai midnight; +4h lands inside that same Dubai day.
    const dubaiStart = new Date(p.start.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
    assert.equal(bounds.gte, dubaiStart, `${key}: start bound`);
  }
});

// ── D2: a void must reverse inside its own payment bucket ────────────────────────────────────
test("D2: voiding a cash sale zeroes cash, not 'unspecified'", () => {
  const out = aggregate(
    input({
      counter: [
        sale({ quantity: 1, payment_method: "cash" }),
        sale({ quantity: -1, payment_method: "cash" }), // reversal carries the original tender
      ],
    }),
  );

  assert.equal(out.payment.cash, 0);
  assert.equal(out.payment.unspecified, 0);
  assert.equal(out.counterRevenue, 0);
  assert.equal(out.orders, 1, "a sale and its reversal is one sale, not two");
});

test("D2: a void that lost its tender is what the bug looked like", () => {
  const out = aggregate(
    input({
      counter: [sale({ quantity: 1, payment_method: "cash" }), sale({ quantity: -1, payment_method: null })],
    }),
  );

  // Total still nets out — which is why this hid — but the split is wrong.
  assert.equal(out.counterRevenue, 0);
  assert.equal(out.payment.cash, 1000, "cash left standing");
  assert.equal(out.payment.unspecified, -1000, "refund filed nowhere");
});

// ── D4: delivery the shop keeps is the shop's revenue ────────────────────────────────────────
test("D4: delivery fee counts as revenue when the shop keeps it", () => {
  const out = aggregate(input({ orders: [order({ delivery_fee: "25" })] }));

  assert.equal(out.revenue, 1025);
  assert.equal(out.deliveryCollected, 25);
  assert.equal(out.deliveryKept, 0);
});

test("D4: delivery the rider keeps is never the shop's revenue", () => {
  const out = aggregate(
    input({
      orders: [order({ delivery_fee: "25" })],
      shops: [{ id: SHOP, rider_keeps_delivery: true }],
    }),
  );

  assert.equal(out.revenue, 1000);
  assert.equal(out.deliveryCollected, 25);
  assert.equal(out.deliveryKept, 25);
});

// ── D5: the product table has to add up to the headline ──────────────────────────────────────
// Revenue is GROSS, matching orders/service.py::_aggregate so the page agrees with the bot's
// /profit; the discount is reported on its own line, so net = revenue − discounts.
test("D5: product revenue sums to headline revenue when a discount applies", () => {
  const out = aggregate(
    input({
      orders: [order({ selling_price: "1500", discount_amount: "50" })],
      catalogue: [{ brand: "Acme", model: "One", quantity: 3 }],
    }),
  );

  const productTotal = out.products.reduce((s, p) => s + p.revenue, 0);
  assert.equal(out.revenue, 1500, "headline is gross, as the Python reference reports it");
  assert.equal(productTotal, out.revenue, "the table under it must agree");
  assert.equal(out.discounts, 50, "the discount is reported on its own");
  assert.equal(out.revenue - out.discounts, 1450, "net is derivable");
});

test("D5: per-shop revenue sums to headline revenue too", () => {
  const out = aggregate(
    input({
      orders: [
        order({ selling_price: "1500", discount_amount: "50", delivery_fee: "20" }),
        order({ shop_id: "shop-2", selling_price: "800" }),
      ],
      shops: [
        { id: SHOP, rider_keeps_delivery: false },
        { id: "shop-2", rider_keeps_delivery: false },
      ],
    }),
  );

  const shopTotal = out.perShop.reduce((s, p) => s + p.revenue, 0);
  assert.equal(shopTotal, out.revenue);
});

// ── the invariant that ties both channels together ───────────────────────────────────────────
test("online + counter revenue always equals the headline", () => {
  const out = aggregate(
    input({
      orders: [order({ selling_price: "1500", discount_amount: "50", delivery_fee: "20" })],
      counter: [sale({ quantity: 2, sold_price: "300" })],
    }),
  );

  assert.equal(out.onlineRevenue, 1520, "gross sale + the delivery the shop kept");
  assert.equal(out.counterRevenue, 600, "sold_price is per unit");
  assert.equal(out.onlineRevenue + out.counterRevenue, out.revenue);
});

// ── counter discounts report exactly like online ones (030) ──────────────────────────────────
test("a POS discount is reported beside revenue, not subtracted from it", () => {
  const out = aggregate(input({ counter: [sale({ sold_price: "1000", discount_amount: "150" })] }));

  assert.equal(out.counterRevenue, 1000, "revenue stays GROSS, same as an online order");
  assert.equal(out.discounts, 150, "the giveaway is reported on its own line");
  assert.equal(out.revenue - out.discounts, 850, "net is derivable");
  assert.equal(out.counterProfit, 250, "profit is (sell − discount) − cost");
  assert.equal(out.discountCount, 1);
});

test("both channels' discounts land in the same figure", () => {
  const out = aggregate(
    input({
      orders: [order({ selling_price: "1500", discount_amount: "50" })],
      counter: [sale({ discount_amount: "20" })],
    }),
  );

  assert.equal(out.discounts, 70, "bot bargaining + counter knock-off, one number");
  assert.equal(out.discountCount, 2, "and both are countable");
});

test("voiding a discounted sale takes the discount back too", () => {
  const out = aggregate(
    input({
      counter: [
        sale({ quantity: 1, discount_amount: "150" }),
        // The reversal carries the negative discount, exactly as actions/pos.ts writes it.
        sale({ quantity: -1, discount_amount: "-150" }),
      ],
    }),
  );

  assert.equal(out.counterRevenue, 0);
  assert.equal(out.discounts, 0, "a voided discount is money the shop never gave away");
  assert.equal(out.counterProfit, 0);
  assert.equal(out.orders, 1);
});

test("discrepancy rows are excluded from every figure", () => {
  const out = aggregate(input({ counter: [sale({ discrepancy: true })] }));

  assert.equal(out.counterRevenue, 0);
  assert.equal(out.payment.cash, 0);
  assert.equal(out.orders, 0);
});
