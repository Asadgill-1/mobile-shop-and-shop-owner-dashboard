// run: node --test lib/vat.test.ts
//
// Migration 036 deliberately has NO database constraint tying vat_amount to 5% of subtotal, because
// true supplier bills miss it. That decision moves the entire burden onto one function: it has to
// stay quiet for the bills that are merely rounded and speak up for the ones that are wrong. Both
// directions are failures — a warning on every bill gets ignored within a week, and a warning that
// never fires is a claim nobody checked.
import test from "node:test";
import assert from "node:assert/strict";
import {
  EMIRATES,
  QUARTER_ANCHORS,
  VAT_TOLERANCE,
  VAT_TREATMENTS,
  recoverableWarning,
  treatmentLabel,
  trnError,
  vatVarianceWarning,
} from "./vat.ts";

test("rounding on a real bill is silent; a wrong figure is not", () => {
  // Exactly 5%.
  assert.equal(vatVarianceWarning(1000, 50, "standard"), null);
  // A bill that rounds per line and then totals lands a fil or two out. This is the case the
  // migration refuses to CHECK, so it must not warn either.
  assert.equal(vatVarianceWarning(1000, 50.02, "standard"), null);
  assert.equal(vatVarianceWarning(1000, 49.98, "standard"), null);
  // One fil past the tolerance is where a human should look at the paper.
  assert.match(vatVarianceWarning(1000, 50.03, "standard") ?? "", /off 5%/);
  // The mistake this is really for: VAT typed as the total, or the net typed as the VAT.
  assert.match(vatVarianceWarning(1000, 1050, "standard") ?? "", /1000\.00/);
  assert.match(vatVarianceWarning(1000, 0, "standard") ?? "", /50\.00/);
});

test("the tolerance is the stated one, in both directions", () => {
  assert.equal(VAT_TOLERANCE, 0.02);
  for (const off of [-VAT_TOLERANCE, 0, VAT_TOLERANCE]) {
    assert.equal(vatVarianceWarning(200, 10 + off, "standard"), null, `±${off} must be quiet`);
  }
  assert.ok(vatVarianceWarning(200, 10 + VAT_TOLERANCE + 0.01, "standard"));
  assert.ok(vatVarianceWarning(200, 10 - VAT_TOLERANCE - 0.01, "standard"));
});

test("a warning is never a refusal — every one of these still books", () => {
  // The function's only job is to return text. Nothing here can return a falsy "blocked" signal,
  // which is what keeps the action's `return { ok: true }` path unconditional.
  const warned = vatVarianceWarning(1000, 999, "standard");
  assert.equal(typeof warned, "string");
  assert.match(warned ?? "", /Booked as entered/);
});

test("only standard-rated bills are measured against 5%", () => {
  // A zero-rated or exempt bill carries no VAT, so 5% is not the question — but VAT that appears on
  // one anyway is worth a word.
  for (const t of ["zero_rated", "exempt", "reverse_charge", "out_of_scope"] as const) {
    assert.equal(vatVarianceWarning(1000, 0, t), null, `${t} with no VAT is normal`);
    assert.ok(vatVarianceWarning(1000, 50, t), `${t} carrying VAT deserves a look`);
  }
});

test("a recoverable claim with no supplier TRN is called out, and only then", () => {
  assert.match(recoverableWarning(true, "") ?? "", /no supplier TRN/);
  assert.equal(recoverableWarning(true, "100123456700003"), null);
  // Not claiming it is a legitimate answer to having no TRN — nothing to warn about.
  assert.equal(recoverableWarning(false, ""), null);
});

test("TRN: 15 digits or nothing at all", () => {
  assert.equal(trnError("100123456700003"), null);
  assert.equal(trnError(""), null, "a cash purchase from an unregistered trader has none");
  assert.equal(trnError("   "), null);
  assert.match(trnError("10012345670000") ?? "", /15 digits/); // 14
  assert.match(trnError("1001234567000034") ?? "", /15 digits/); // 16
  assert.match(trnError("10012345670000X") ?? "", /15 digits/);
});

test("the vocabulary matches the columns migration 036 will accept", () => {
  // These five words are a CHECK constraint on two tables. A sixth added here and not there would
  // fail at insert time, in front of whoever is booking a bill.
  assert.deepEqual(
    VAT_TREATMENTS.map((t) => t.value),
    ["standard", "zero_rated", "exempt", "reverse_charge", "out_of_scope"],
  );
  assert.equal(treatmentLabel("zero_rated"), "Zero-rated 0%");
  assert.equal(treatmentLabel("nonsense"), "nonsense", "an unknown word must still render");
  // Seven emirates, and the return has a box for each.
  assert.equal(EMIRATES.length, 7);
  assert.ok(EMIRATES.includes("Umm Al Quwain"));
  // Three stagger groups; the default (3) is the calendar quarter.
  assert.deepEqual(QUARTER_ANCHORS.map((q) => q.value), [1, 2, 3]);
});
