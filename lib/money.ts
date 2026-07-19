// SHARED with owner-dashboard-mobile — edit both (PLAN §3.4)
// AED formatting. Whole dirhams for dashboards (mirrors the bots' `3,400 AED`);
// money math stays in the DB's numeric strings until display.

const aedFmt = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 0,
});

export function aed(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return aedFmt.format(Number.isFinite(n) ? n : 0);
}

export function num(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Net charge of an order: selling_price is the TOTAL gross (unit × qty) in this schema. */
export function orderNet(o: { selling_price: string | number; discount_amount: string | number }): number {
  return num(o.selling_price) - num(o.discount_amount);
}
