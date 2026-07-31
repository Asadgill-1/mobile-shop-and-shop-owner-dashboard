// The rules half of the manager-PIN gate (migration 035): the numbers, the vocabulary, and the two
// pure helpers. Split from override.ts, which owns the plumbing — the database lookup, the scrypt
// verification and the lockout.
//
// The seam is real and not a test artefact: THIS is the file an owner would be tuning, and it has no
// imports at all, so it can be read, reasoned about and exercised without a database, a session or a
// running server. Every call site still imports from ./override, which re-exports all of it.
//
// Nothing here decides anything on its own. The actions build their needs from these numbers against
// values they read from the database, and override.ts verifies the PIN. That order matters: the
// browser never sees a threshold and never supplies an amount.

export const PIN_MIN = 6;

/**
 * Defaults, in AED unless the name says otherwise. Per-shop overrides live in manager_pins.limits
 * as deltas — a shop selling 30k phones raises its own ceiling without a deploy, every other shop
 * keeps these.
 *
 * Every one gates the LOOSENING direction only. Charging list price, raising a price, restocking
 * and cancelling a small order are all one tap, because a till that asks permission to do its job
 * stops being a till.
 */
export const LIMITS = {
  discount_aed: 200, // whole-cart giveaway at the till
  discount_pct: 10, // …or this share of the cart, whichever bites first
  price_below_pct: 10, // unit price this far under selling_price
  void_aed: 1_000, // reversing a completed sale (an older one is gated at any value)
  cancel_aed: 2_000, // cancelling a live order
  stock_aed: 1_000, // a manual stock correction worth this much at cost
  stock_units: 5, // …or this many units, whichever bites first
  price_cut_pct: 15, // cutting selling_price by this share (raising it never gates)
};
export type Limits = typeof LIMITS;

export type OverrideKind =
  | "discount" // cart giveaway at the till
  | "unit_price" // a line rung below list, floor or cost
  | "void" // a completed counter sale reversed
  | "cancel" // a live order cancelled
  | "stock_adjust" // a manual correction to the count
  | "product_delete" // always
  | "cost_edit" // always — cost is the denominator of every margin figure
  | "price_cut" // selling_price cut
  | "trn"; // always — it prints on every tax invoice

export interface OverrideNeed {
  kind: OverrideKind;
  /** What tripped it. AED for money, whole units for stock_adjust, percent for price_cut. */
  amount?: number;
  /** What it was measured against, same unit. Both omitted for the always-PIN kinds. */
  threshold?: number;
  /** One finished human line — this is what the owner reads in the approvals view. */
  detail: string;
  ref?: { table: string; id?: string };
}

/** Shaped to drop straight into an action's ActionResult. */
export type OverrideRefusal = { ok: false; error: string; needsPin?: true };

/** Money for a stored `detail` line. Not money.ts's aed() — that returns non-breaking spaces, which
 *  belong on a screen and not in a database column that is also exported as CSV. */
export function aedText(v: number): string {
  return `AED ${v.toFixed(2)}`;
}

/** Digits only, and long enough that the lockout is what stops a guess rather than luck. */
export function pinError(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return "The PIN must be digits only.";
  if (pin.length < PIN_MIN) return `The PIN must be at least ${PIN_MIN} digits.`;
  return null;
}
