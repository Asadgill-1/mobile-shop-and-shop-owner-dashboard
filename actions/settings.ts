"use server";

// Mirror of set_negotiation (orders/service.py): whether the AI may raise price
// requests for this shop. Off = the AI holds at list price, no discounts.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertShop, getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import type { ActionResult } from "./orders";

/** Invoice identity printed on every tax invoice (migration 022): TRN, legal name, address. */
export async function setInvoiceIdentity(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = await getScope();
  const shopId = String(formData.get("shop_id") ?? "");
  assertShop(scope, shopId);

  const trn = String(formData.get("trn") ?? "").trim();
  if (trn && !/^\d{15}$/.test(trn)) {
    return { ok: false, error: "A UAE TRN is 15 digits." };
  }
  const { error } = await db
    .from("shops")
    .update({
      trn: trn || null,
      invoice_name: String(formData.get("invoice_name") ?? "").trim() || null,
      invoice_address: String(formData.get("invoice_address") ?? "").trim() || null,
    })
    .eq("id", shopId);
  if (error) return { ok: false, error: "Could not save invoice details." };
  await audit(`dashboard:${scope.email}`, "dash_invoice_identity", shopId, { args: [] });
  revalidatePath("/settings");
  return { ok: true, message: "Invoice details saved." };
}

export async function setNegotiation(shopId: string, enabled: boolean): Promise<ActionResult> {
  const scope = await getScope();
  assertShop(scope, shopId);
  const { error } = await db
    .from("shops")
    .update({ negotiation_enabled: enabled })
    .eq("id", shopId);
  if (error) return { ok: false, error: "Could not save the setting." };
  await audit(`dashboard:${scope.email}`, "kneg", shopId, { args: [enabled ? "on" : "off"] });
  revalidatePath("/settings");
  return { ok: true, message: `Negotiation ${enabled ? "on" : "off"}.` };
}

/** Delivery-cash policy (023): true = the rider keeps the delivery fee (it's their earning, the
 *  reconcile ledger only tracks the product money); false = the rider hands all cash to the shop. */
export async function setRiderKeepsDelivery(shopId: string, enabled: boolean): Promise<ActionResult> {
  const scope = await getScope();
  assertShop(scope, shopId);
  const { error } = await db
    .from("shops")
    .update({ rider_keeps_delivery: enabled })
    .eq("id", shopId);
  if (error) return { ok: false, error: "Could not save the setting." };
  await audit(`dashboard:${scope.email}`, "dash_rider_delivery", shopId, {
    args: [enabled ? "keep" : "handover"],
  });
  revalidatePath("/settings");
  return {
    ok: true,
    message: enabled ? "Riders keep the delivery fee." : "Riders hand delivery cash to the shop.",
  };
}
