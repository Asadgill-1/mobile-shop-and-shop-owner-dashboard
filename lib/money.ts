// SHARED with owner-dashboard-mobile — edit both (PLAN §3.4)
// AED formatting. Whole dirhams for dashboards (mirrors the bots' `3,400 AED`);
// money math stays in the DB's numeric strings until display.

const aedFmt = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 0,
});

/** Intl glues "AED" to the digits with a non-breaking space; a normal space lets a narrow
 *  stat card wrap as "AED" / "11,397" instead of clipping or breaking mid-number. */
function breakable(s: string): string {
  return s.replace(/ /g, " ");
}

export function aed(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return breakable(aedFmt.format(Number.isFinite(n) ? n : 0));
}

export function num(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Net charge of an order: selling_price is the TOTAL gross (unit × qty) in this schema. */
export function orderNet(o: { selling_price: string | number; discount_amount: string | number }): number {
  return num(o.selling_price) - num(o.discount_amount);
}

const aed2Fmt = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Fils-exact AED — tax invoices must show the VAT amount to the fils (FTA). */
export function aed2(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return breakable(aed2Fmt.format(Number.isFinite(n) ? n : 0));
}

/** VAT inside a VAT-inclusive retail total: total × 5/105, computed in integer fils
 *  so float dust can't make the printed lines disagree with the printed total. */
export function vatFromInclusive(total: number): number {
  const fils = Math.round(total * 100);
  return Math.round((fils * 5) / 105) / 100;
}

/** VAT charged ON TOP of a net (ex-VAT) amount: net × 5%. products.selling_price is stored before
 *  VAT, so this — not vatFromInclusive — is the POS's arithmetic. Integer fils for the same reason. */
export function vatOnNet(net: number): number {
  return Math.round(Math.round(net * 100) * 5 / 100) / 100;
}

/** Net (ex-VAT) → what the customer pays. Mirror of the backend's utils/vat.py::with_vat — the two
 *  must agree to the fil, or an invoice will not match the COD the rider was told to collect. */
export function withVat(net: number): number {
  return Math.round(num(net) * 105) / 100;
}

/** Money inside a message to a customer: whole dirhams stay whole, fils show when VAT makes them. */
export function msgAed(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/**
 * Split a whole-sale discount across the lines in proportion to their value, in whole fils.
 *
 * counter_sales holds one row per product, so a cart-level giveaway has to land somewhere: each
 * line records its own share and "who discounted what" stays answerable per product. Flooring every
 * share and handing the leftover fils to the biggest lines keeps Σ parts === the discount exactly —
 * otherwise the sale rows and the invoice would disagree by a fil or two.
 */
export function allocateDiscount(discount: number, lineTotals: number[]): number[] {
  const filsOf = lineTotals.map((v) => Math.round(v * 100));
  const gross = filsOf.reduce((s, v) => s + v, 0);
  const want = Math.round(discount * 100);
  if (want <= 0 || gross <= 0) return lineTotals.map(() => 0);

  const parts = filsOf.map((f) => Math.floor((f * want) / gross));
  let rest = want - parts.reduce((s, v) => s + v, 0);
  const biggestFirst = filsOf.map((_, i) => i).sort((a, b) => filsOf[b] - filsOf[a]);
  for (let k = 0; rest > 0; k = (k + 1) % biggestFirst.length, rest--) parts[biggestFirst[k]]++;
  return parts.map((f) => f / 100);
}
