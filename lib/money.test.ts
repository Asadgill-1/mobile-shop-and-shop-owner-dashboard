// Run: node --test lib/money.test.ts   (Node 24 strips the types natively — no test dep)
//
// The POS money path: products.selling_price is stored BEFORE VAT (030), so the till adds 5% on
// top and a cart-level discount is split across the sale rows. Both are fils-exact by construction
// — a rounding slip here shows up as an invoice whose parts don't add to its total.
import { test } from "node:test";
import assert from "node:assert/strict";

import { allocateDiscount, vatFromInclusive, vatOnNet } from "./money.ts";

test("VAT is charged on top of the stored price, not carved out of it", () => {
  assert.equal(vatOnNet(1000), 50);
  assert.equal(vatOnNet(1350), 67.5);
  assert.equal(vatOnNet(0), 0);

  // The bug this replaces: treating an ex-VAT price as inclusive under-collects the tax and the
  // shop pays the difference out of its own margin.
  assert.equal(vatFromInclusive(1000), 47.62);
  assert.ok(vatOnNet(1000) > vatFromInclusive(1000));
});

test("a price + its VAT is what the customer actually pays", () => {
  for (const net of [1, 99.99, 1350, 3399, 10_000]) {
    const total = Math.round((net + vatOnNet(net)) * 100) / 100;
    // Reading the VAT back out of that total returns what was charged — the two views agree.
    assert.equal(vatFromInclusive(total), vatOnNet(net), `net ${net}`);
  }
});

test("VAT rounds at the fils, so no float dust reaches the invoice", () => {
  assert.equal(vatOnNet(0.1), 0.01); // 0.005 → half-up
  assert.equal(vatOnNet(1349.99), 67.5);
  assert.equal(vatOnNet(19.99), 1); // 0.9995 → 1.00, never 0.99999999
});

test("an allocated discount always sums back to exactly what was given", () => {
  const cases: [number, number[]][] = [
    [100, [1000, 500]],
    [33.33, [10, 10, 10]], // the classic thirds case
    [0.01, [500, 500]], // one fil, two lines
    [7.77, [1234.56, 99.99, 0.01]],
    [1350, [1350]],
  ];
  for (const [discount, lines] of cases) {
    const parts = allocateDiscount(discount, lines);
    const sum = Math.round(parts.reduce((s, v) => s + v, 0) * 100) / 100;
    assert.equal(sum, discount, `${discount} over ${lines.join("+")}`);
    assert.equal(parts.length, lines.length);
    assert.ok(parts.every((p) => p >= 0), "no line gets a negative share");
  }
});

test("the discount lands in proportion to line value", () => {
  assert.deepEqual(allocateDiscount(150, [1000, 500]), [100, 50]);
  // The rounding leftover goes to the biggest line, not to whichever came first.
  const parts = allocateDiscount(10, [0.02, 999.98]);
  assert.equal(parts[1], 10);
});

test("no discount, or nothing to discount, allocates nothing", () => {
  assert.deepEqual(allocateDiscount(0, [100, 200]), [0, 0]);
  assert.deepEqual(allocateDiscount(-5, [100]), [0]);
  assert.deepEqual(allocateDiscount(50, [0, 0]), [0, 0]);
});
