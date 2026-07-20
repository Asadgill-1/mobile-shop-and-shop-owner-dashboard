"use server";

// Shop offers CRUD (migration 023). One active offer per product — creating a new one for a
// product that already has an active offer replaces it (deactivate then insert). Tenant-guarded:
// the qualifying product and any gift product must both belong to the caller's shops.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { defaultOfferLabel } from "@/lib/offers";
import type { OfferType } from "@/lib/types";
import type { ActionResult } from "./orders";

const TYPES: OfferType[] = ["free_gift", "percent_off", "amount_off", "free_delivery", "bogo", "bulk"];
const NEEDS_GIFT: OfferType[] = ["free_gift"];
const NEEDS_VALUE: OfferType[] = ["percent_off", "amount_off", "bogo", "bulk"];

async function ownsProduct(shopIds: string[], productId: string): Promise<string | null> {
  const { data } = await db
    .from("products")
    .select("shop_id")
    .eq("id", productId)
    .in("shop_id", shopIds)
    .maybeSingle();
  return data?.shop_id ?? null;
}

export async function createOffer(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = await getScope();
  const productId = String(formData.get("product_id") ?? "");
  const type = String(formData.get("type") ?? "") as OfferType;
  if (!TYPES.includes(type)) return { ok: false, error: "Pick an offer type." };

  const shopId = await ownsProduct(scope.shopIds, productId);
  if (!shopId) return { ok: false, error: "Product not found." };

  let giftProductId: string | null = null;
  let giftName: string | undefined;
  if (NEEDS_GIFT.includes(type)) {
    giftProductId = String(formData.get("gift_product_id") ?? "");
    const { data: gift } = await db
      .from("products")
      .select("brand,model")
      .eq("id", giftProductId)
      .eq("shop_id", shopId) // gift must be the SAME shop's product
      .maybeSingle();
    if (!gift) return { ok: false, error: "Pick a gift product from this shop." };
    giftName = `${gift.brand} ${gift.model}`.trim();
  }

  let value: number | null = null;
  if (NEEDS_VALUE.includes(type)) {
    value = Number(formData.get("value"));
    if (!Number.isFinite(value) || value <= 0) return { ok: false, error: "Enter a positive value." };
    if (type === "percent_off" && value > 100) return { ok: false, error: "Percentage can't exceed 100." };
  }

  const label =
    String(formData.get("label") ?? "").trim() || defaultOfferLabel(type, value ?? 0, giftName);

  // one active per product: retire any current active offer first (unique partial index enforces it)
  await db.from("offers").update({ active: false }).eq("product_id", productId).eq("active", true);
  const { error } = await db.from("offers").insert({
    shop_id: shopId,
    product_id: productId,
    type,
    gift_product_id: giftProductId,
    value: value === null ? null : String(value),
    label,
  });
  if (error) return { ok: false, error: "Could not save the offer." };

  // product_number for the audit line
  const { data: prod } = await db
    .from("products")
    .select("product_number")
    .eq("id", productId)
    .maybeSingle();
  await audit(`dashboard:${scope.email}`, "dash_offer_new", shopId, {
    args: [type.replace("_", " "), prod?.product_number ?? "?"],
    text: label,
  });
  revalidatePath(`/inventory/${productId}`);
  return { ok: true, message: "Offer live — the AI will mention it to customers." };
}

export async function endOffer(offerId: string): Promise<ActionResult> {
  const scope = await getScope();
  const { data: offer } = await db
    .from("offers")
    .select("id,shop_id,product_id,products(product_number)")
    .eq("id", offerId)
    .in("shop_id", scope.shopIds)
    .maybeSingle();
  if (!offer) return { ok: false, error: "Offer not found." };

  await db.from("offers").update({ active: false }).eq("id", offerId);
  const prod = Array.isArray(offer.products) ? offer.products[0] : offer.products;
  await audit(`dashboard:${scope.email}`, "dash_offer_off", offer.shop_id, {
    args: [(prod as { product_number: number | null } | null)?.product_number ?? "?"],
  });
  revalidatePath(`/inventory/${offer.product_id}`);
  return { ok: true, message: "Offer ended." };
}
