// Shop offers (migration 023). One active offer per product. The compute helper turns an offer
// + a line (unit price, qty, per-unit floor) into the concrete effects a sale applies:
//   discount (AED off the line), freeDelivery (zero the home-delivery fee), gift (a product whose
//   stock decrements and prints as a 0.00 invoice line). Pure + covered by a __checks__ self-test.
import type { OfferType } from "./types";

export interface OfferRow {
  id: string;
  shop_id: string;
  product_id: string;
  type: OfferType;
  gift_product_id: string | null;
  value: string | null;
  label: string;
  active: boolean;
}

export interface OfferEffect {
  discount: number; // AED off the whole line (never pushes net below the floor)
  freeDelivery: boolean;
  giftProductId: string | null;
}

/** round to fils. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Concrete effect of an offer on one product line. minPrice = per-unit floor (products.min_price,
 *  0 = floor is 0). Discounts clamp so net-per-unit never drops below the floor. */
export function computeOffer(
  offer: OfferRow | null | undefined,
  unitPrice: number,
  qty: number,
  minPrice = 0,
): OfferEffect {
  const none: OfferEffect = { discount: 0, freeDelivery: false, giftProductId: null };
  if (!offer || !offer.active || qty <= 0) return none;
  const v = Number(offer.value ?? 0);
  const lineTotal = unitPrice * qty;
  const maxDiscount = Math.max(0, lineTotal - minPrice * qty); // keep net ≥ floor
  const cap = (d: number) => r2(Math.min(Math.max(0, d), maxDiscount));

  switch (offer.type) {
    case "free_gift":
      return { ...none, giftProductId: offer.gift_product_id };
    case "free_delivery":
      return { ...none, freeDelivery: true };
    case "percent_off":
      return { ...none, discount: cap(lineTotal * (v / 100)) };
    case "amount_off":
      return { ...none, discount: cap(v) };
    case "bogo": {
      // buy N, get 1 free: one free unit per (N+1) bought. value 1 = classic buy-1-get-1.
      const group = v + 1;
      const freeUnits = group > 0 ? Math.floor(qty / group) : 0;
      return { ...none, discount: cap(freeUnits * unitPrice) };
    }
    case "bulk":
      // buy ≥ value units → the whole line gets a modest 10% off (kept simple; tune later).
      return { ...none, discount: qty >= v && v > 0 ? cap(lineTotal * 0.1) : 0 };
    default:
      return none;
  }
}

/** Default customer-facing label when the shop doesn't type one. giftName is resolved by the caller. */
export function defaultOfferLabel(type: OfferType, value: number, giftName?: string): string {
  switch (type) {
    case "free_gift":
      return giftName ? `Free ${giftName} with this` : "Free gift with purchase";
    case "free_delivery":
      return "Free home delivery";
    case "percent_off":
      return `${value}% off`;
    case "amount_off":
      return `${value} AED off`;
    case "bogo":
      return value === 1 ? "Buy 1 get 1 free" : `Buy ${value} get 1 free`;
    case "bulk":
      return `Buy ${value}+ and save`;
    default:
      return "Special offer";
  }
}
