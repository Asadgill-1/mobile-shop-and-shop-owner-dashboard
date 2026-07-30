// Run: node --test lib/payment-ref.test.ts   (Node 24 strips the types natively — no test dep)
//
// The card reference typed at the till (031). Two things matter: a card sale that carries no
// reference can never be matched to the acquirer's settlement file, and a free-text box beside a
// card machine is exactly where somebody types the card number itself — storing a PAN is a PCI
// incident, so the guard has to reject one without also rejecting legitimate references.
import { test } from "node:test";
import assert from "node:assert/strict";

import { paymentRefError, PAYMENT_REF_MAX } from "./types.ts";

test("cash never needs a reference", () => {
  assert.equal(paymentRefError("cash", ""), null);
  assert.equal(paymentRefError("cash", "   "), null);
});

test("a card sale without a reference is refused", () => {
  assert.match(paymentRefError("card", "") ?? "", /transaction \/ approval number/i);
  assert.match(paymentRefError("card", "   ") ?? "", /transaction \/ approval number/i);
});

test("real terminal references pass", () => {
  // 6-digit approval code, 12-digit RRN, alphanumeric auth, and a hyphenated batch/trace.
  for (const ref of ["041233", "123456789012", "A1B2C3", "0412-0098", "AUTH 88213/02"]) {
    assert.equal(paymentRefError("card", ref), null, `${ref} should be accepted`);
  }
});

test("a card number is refused, so a PAN never reaches the database", () => {
  // Luhn-valid test PANs (Visa/Mastercard/Amex test ranges), spaced and unspaced.
  for (const pan of ["4111111111111111", "4111 1111 1111 1111", "5555555555554444", "378282246310005"]) {
    assert.match(paymentRefError("card", pan) ?? "", /card number/i, `${pan} should be rejected`);
  }
});

test("a 12-digit RRN is not mistaken for a card number", () => {
  // The Luhn window starts at 13 digits on purpose: this RRN is Luhn-valid at 12 and must pass.
  assert.equal(paymentRefError("card", "000000000000"), null);
});

test("junk and overlong input are refused", () => {
  assert.match(paymentRefError("card", "ref;drop table") ?? "", /letters, digits/i);
  assert.match(paymentRefError("card", "A".repeat(PAYMENT_REF_MAX + 1)) ?? "", /too long/i);
});
