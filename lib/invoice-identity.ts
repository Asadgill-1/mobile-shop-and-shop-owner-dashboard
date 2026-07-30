// SHARED by every path that ISSUES a tax invoice (PLAN §5.5).
import "server-only";
import { db } from "./db";

/**
 * A UAE tax invoice must carry the supplier's TRN (FTA). A shop without one cannot produce a
 * compliant document, so it must not produce one at all: the print page's missing-TRN warning is
 * `noprint`, so the sheet that leaves the counter still says TAX INVOICE and simply omits the
 * number — invalid, and invisible to whoever is holding it.
 *
 * Returns the message to hand back as `ActionResult.error`, or null when the shop may invoice.
 *
 * Credit notes deliberately do NOT call this. Refusing to reverse an invoice that was already
 * issued would strand the supply with no way to unwind it — the exact failure D6 was about.
 */
export async function invoiceIdentityError(shopId: string): Promise<string | null> {
  const { data: shop } = await db
    .from("shops")
    .select("trn")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop?.trn) {
    return "This shop has no TRN, so it can't issue a tax invoice. Add it in Settings → invoice identity.";
  }
  return null;
}
