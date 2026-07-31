// Covers BOTH copies of period.ts: the console's is byte-identical (SHARED, PLAN §3.4) and has no
// test runner of its own, so the file lives here once rather than rotting in two places.
// run: node --test lib/period.test.ts
//
// The window a report asks for decides which rows land in it. For a VAT return that is not a
// display detail: a boundary off by one Dubai day moves a quarter's last sale into the next filing.
import test from "node:test";
import assert from "node:assert/strict";
import { parsePeriod } from "./period.ts";

/** The Dubai calendar date of an instant — what a boundary actually means to a shop. */
function dubaiDay(t: Date): string {
  return new Date(t.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}

test("a filing period runs Dubai midnight to Dubai midnight, last day included", () => {
  const p = parsePeriod("2026-01-01..2026-03-31");

  assert.equal(p.start.toISOString(), "2025-12-31T20:00:00.000Z", "Dubai midnight, 1 Jan");
  assert.equal(p.end.toISOString(), "2026-03-31T20:00:00.000Z", "Dubai midnight, 1 Apr");
  // end is EXCLUSIVE, so 31 March must sit inside the window — the quarter's last day of trading
  // is the one an accountant is most likely to lose.
  assert.equal(dubaiDay(new Date(p.end.getTime() - 1)), "2026-03-31");
  assert.equal(p.key, "2026-01-01..2026-03-31");
});

test("a single-day range is exactly one Dubai day", () => {
  const one = parsePeriod("2026-07-28..2026-07-28");
  const same = parsePeriod("2026-07-28");

  assert.equal(one.start.getTime(), same.start.getTime());
  assert.equal(one.end.getTime(), same.end.getTime());
  assert.equal(one.end.getTime() - one.start.getTime(), 24 * 3600_000);
});

test("a range that cannot be a filing period falls back to today, never crashes", () => {
  const today = parsePeriod("today");
  for (const bad of [
    "2026-03-31..2026-01-01", // backwards
    "2026-02-31..2026-03-01", // 31 February — Date.UTC would roll it into March
    "2026-01-01..2026-13-01", // month 13
    "2026-01-01..",           // half a range
    "..2026-03-31",
    "2026-01-01...2026-03-31",
  ]) {
    const p = parsePeriod(bad);
    assert.equal(p.key, "today", `${bad} should not be accepted as a range`);
    assert.equal(p.start.getTime(), today.start.getTime());
  }
});

test("the presets still behave", () => {
  for (const key of ["today", "yesterday", "weekly", "monthly"]) {
    const p = parsePeriod(key);
    assert.equal(p.key, key);
    assert.ok(p.end > p.start, `${key}: end after start`);
    // Every window starts at a Dubai midnight — the invariant every sold_on filter leans on.
    assert.equal((p.start.getTime() + 4 * 3600_000) % (24 * 3600_000), 0, `${key}: Dubai midnight`);
  }
  assert.equal(parsePeriod("weekly").end.getTime() - parsePeriod("weekly").start.getTime(),
    7 * 24 * 3600_000, "weekly is 7 Dubai days");
});
