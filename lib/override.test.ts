// run: node --test lib/override.test.ts
//
// The PIN gate has two halves that can fail silently in opposite directions, so both are pinned
// here: the crypto (a hash that verifies something it should not, or refuses something it should
// accept) and the threshold arithmetic (a limit that never bites, or bites on every ordinary sale).
//
// requireOverride itself is not tested here — it needs a database. What IS testable without one is
// exactly what would be wrong if the gate misbehaved: the digest, and the comparisons the actions
// hand it. The rules below are transcribed from the call sites, so a rule that changes there and
// not here shows up as a disagreement rather than as a silent hole.
import test from "node:test";
import assert from "node:assert/strict";
import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
// ./override-rules, not ./override: the plumbing half imports lib/db, and the point of the split is
// that the numbers can be exercised with no database, no session and no server.
import { LIMITS, PIN_MIN, aedText, pinError } from "./override-rules.ts";

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

test("a peppered hash verifies the right PIN and nothing else", async () => {
  const [pepper, salt] = ["server-side-secret", "0123456789abcdef"];
  const digest = await scryptAsync("246810" + pepper, salt, 64);

  const verify = async (pin: string, withPepper: string) => {
    const got = await scryptAsync(pin + withPepper, salt, 64);
    return got.length === digest.length && timingSafeEqual(got, digest);
  };

  assert.ok(await verify("246810", pepper), "the correct PIN must verify");
  assert.ok(!(await verify("246811", pepper)), "a PIN one digit off must not");
  // The whole reason the pepper is not in the database: the stored row alone is not enough.
  assert.ok(!(await verify("246810", "")), "the hash must be worthless without the pepper");
  assert.ok(!(await verify("246810", "wrong-pepper")), "…or with the wrong one");
});

test("a PIN must be digits and long enough to make the lockout the binding constraint", () => {
  assert.equal(pinError("482913"), null);
  assert.equal(pinError("4829130000"), null);
  assert.match(pinError("12345") ?? "", /at least 6/);
  assert.match(pinError("abcdef") ?? "", /digits only/);
  assert.match(pinError("4829 13") ?? "", /digits only/);
  assert.match(pinError("") ?? "", /digits only/);
  assert.equal(PIN_MIN, 6);
});

test("detail lines carry plain spaces, not money.ts's non-breaking ones", () => {
  // aed() renders U+00A0 so a price never wraps mid-figure on screen. These strings are stored in
  // a database column and exported as CSV, where that character is a bug you find in a spreadsheet.
  assert.equal(aedText(1417.5), "AED 1417.50");
  assert.ok(!aedText(1417.5).includes(" "));
});

/* ---- the arithmetic the call sites do, transcribed ---- */

const discountTrips = (discount: number, gross: number) =>
  discount > LIMITS.discount_aed || (gross > 0 && discount > Math.round(gross * LIMITS.discount_pct) / 100);

test("a cart discount trips on either the AED limit or the percentage, whichever bites first", () => {
  assert.ok(!discountTrips(50, 4000), "50 off a 4,000 cart is ordinary");
  assert.ok(discountTrips(250, 40_000), "250 is over the AED limit even on a huge cart");
  assert.ok(discountTrips(150, 800), "150 is under the AED limit but 18.75% of the cart");
  assert.ok(!discountTrips(200, 2000), "exactly at both limits is allowed — the rule is >, not >=");
  assert.ok(!discountTrips(0, 4000), "no discount never asks for a PIN");
});

const priceTrips = (price: number, list: number, cost: number, floor: number | null) =>
  price < cost || (floor != null && price < floor) || price < list * (1 - LIMITS.price_below_pct / 100);

test("a unit price trips below cost, below the floor, or too far under list", () => {
  const [list, cost, floor] = [4000, 3000, 3500];
  // The hole this phase closed: unit_price was validated only as finite and >= 0.
  assert.ok(priceTrips(1, list, cost, floor), "a 4,000 phone rung at 1 AED must be gated");
  assert.ok(priceTrips(2900, list, cost, floor), "below cost");
  assert.ok(priceTrips(3400, list, cost, floor), "above cost but below the bargaining floor");
  assert.ok(priceTrips(3500, list, cost, null), "12.5% under list with no floor set");
  assert.ok(!priceTrips(3700, list, cost, floor), "7.5% off is haggling, not a giveaway");
  assert.ok(!priceTrips(4000, list, cost, floor), "list price never asks");
  assert.ok(!priceTrips(4500, list, cost, floor), "raising the price is never the fraud");
});

test("a void trips on value OR on not being today's sale", () => {
  const trips = (paid: number, sameDay: boolean) => paid > LIMITS.void_aed || !sameDay;
  assert.ok(!trips(300, true), "a small same-day void is a mis-ring, not an event");
  assert.ok(trips(1500, true), "over the limit");
  assert.ok(trips(20, false), "reversing an older sale is gated at any value — it crosses a Z-report");
});

test("a stock correction trips on units OR on value at cost", () => {
  const trips = (units: number, cost: number) =>
    units > LIMITS.stock_units || Math.round(units * cost * 100) / 100 > LIMITS.stock_aed;
  assert.ok(!trips(2, 40), "two accessories is a recount");
  assert.ok(trips(8, 40), "eight units is a pattern");
  assert.ok(trips(1, 3800), "one phone is only 1 unit but 3,800 AED of stock");
});

test("selling price is gated in the cutting direction only", () => {
  const cut = (from: number, to: number) => ((from - to) / from) * 100;
  assert.ok(cut(4000, 3000) > LIMITS.price_cut_pct, "a 25% cut is gated");
  assert.ok(!(cut(4000, 3600) > LIMITS.price_cut_pct), "a 10% cut is repricing");
  assert.ok(!(cut(4000, 5000) > LIMITS.price_cut_pct), "raising a price is never gated");
});
