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

/** Who the customer is talking to (migration 027).
 *
 *  The gender is not decoration: Hindi, Urdu and Arabic conjugate verbs by the speaker's gender,
 *  and most customers here write in romanised Hindi/Urdu. A "Sara" using masculine verb forms is
 *  an instant giveaway that no amount of tone work covers.
 *
 *  `style` is free text that ends up inside the assistant's system prompt, so the backend caps
 *  its length and strips newlines before use — see llm/prompts.py. Worst case a shop makes its
 *  own assistant sound odd; it can never reach the price floor or the safety rules.
 */
export async function setAssistantPersona(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = await getScope();
  const shopId = String(formData.get("shop_id") ?? "");
  assertShop(scope, shopId);

  const name = String(formData.get("assistant_name") ?? "").trim();
  const genderRaw = String(formData.get("assistant_gender") ?? "").trim();
  const style = String(formData.get("assistant_style") ?? "").trim();

  if (name.length > 40) return { ok: false, error: "Keep the name short." };
  if (genderRaw && genderRaw !== "female" && genderRaw !== "male") {
    return { ok: false, error: "Pick female or male, or leave it unset." };
  }
  if (style.length > 200) return { ok: false, error: "Keep the style note under 200 characters." };

  const { error } = await db
    .from("shops")
    .update({
      assistant_name: name || null,
      assistant_gender: genderRaw || null,
      assistant_style: style || null,
    })
    .eq("id", shopId);
  if (error) return { ok: false, error: "Could not save the assistant details." };
  await audit(`dashboard:${scope.email}`, "dash_assistant_persona", shopId, {
    args: [name || "unnamed"],
  });
  revalidatePath("/settings");
  return {
    ok: true,
    message: name ? `Customers now talk to ${name}.` : "Assistant speaks as the shop.",
  };
}

/** How far the assistant may bargain without asking (migration 027).
 *
 *  `askEveryTime` on is the default and the safe one: every haggle reaches a human, exactly as
 *  before. Off hands the assistant a bounded mandate — it may settle down to a floor computed
 *  server-side from this percentage, the product's own minimum price, and never below cost.
 */
export async function setHaggleAuthority(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = await getScope();
  const shopId = String(formData.get("shop_id") ?? "");
  assertShop(scope, shopId);

  const askEveryTime = formData.get("ask_every_time") === "on";
  const pct = Number(String(formData.get("max_discount_pct") ?? "0").trim() || "0");
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return { ok: false, error: "Discount limit must be between 0 and 100." };
  }

  const { error } = await db
    .from("shops")
    .update({ haggle_ask_every_time: askEveryTime, ai_max_discount_pct: pct })
    .eq("id", shopId);
  if (error) return { ok: false, error: "Could not save the bargaining limit." };
  await audit(`dashboard:${scope.email}`, "dash_haggle_authority", shopId, {
    args: [askEveryTime ? "ask" : `auto ${pct}%`],
  });
  revalidatePath("/settings");
  return {
    ok: true,
    message: askEveryTime
      ? "You'll be asked before every discount."
      : `Assistant may settle up to ${pct}% off on its own.`,
  };
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
