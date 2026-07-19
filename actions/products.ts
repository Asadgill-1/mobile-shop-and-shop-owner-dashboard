"use server";

// Product mutations — mirror products/service.py: every one resolves the product
// within the caller's shops first (THE tenant guard), then patches.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { notifyLowStock, shopForNotify } from "@/lib/notify";
import {
  VALID_CATEGORIES,
  VALID_CONDITIONS,
  VALID_TAGS,
  parseNonEmpty,
  parsePrice,
  parseQuantity,
  parseSpecs,
} from "@/lib/validate";
import type { ActionResult } from "./orders";

async function actor(): Promise<{ email: string; shopIds: string[] }> {
  const scope = await getScope();
  return { email: `dashboard:${scope.email}`, shopIds: scope.shopIds };
}

async function ownProduct(shopIds: string[], productId: string): Promise<{ id: string; shop_id: string; tags: string[]; is_featured: boolean; product_number: number | null } | null> {
  const { data } = await db
    .from("products")
    .select("id,shop_id,tags,is_featured,product_number")
    .eq("id", productId)
    .in("shop_id", shopIds)
    .maybeSingle();
  return data;
}

function productFields(formData: FormData): Record<string, unknown> {
  const category = String(formData.get("category") ?? "");
  const condition = String(formData.get("condition") ?? "");
  if (!(VALID_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`Category must be one of: ${VALID_CATEGORIES.join(", ")}.`);
  }
  if (!(VALID_CONDITIONS as readonly string[]).includes(condition)) {
    throw new Error(`Condition must be one of: ${VALID_CONDITIONS.join(", ")}.`);
  }
  const cost = parsePrice(String(formData.get("cost_price") ?? ""), "Cost price");
  const sell = parsePrice(String(formData.get("selling_price") ?? ""), "Selling price");
  return {
    category,
    condition,
    brand: parseNonEmpty(String(formData.get("brand") ?? ""), "Brand"),
    model: parseNonEmpty(String(formData.get("model") ?? ""), "Model"),
    color: String(formData.get("color") ?? "").trim() || null,
    specs: parseSpecs(String(formData.get("specs") ?? "")),
    cost_price: String(cost),
    selling_price: String(sell),
    min_qty: parseQuantity(String(formData.get("min_qty") ?? "0")),
    barcode: String(formData.get("barcode") ?? "").trim() || null,
  };
}

const IMEI_RE = /^[0-9A-Za-z-]{8,20}$/;

/** "one per line" textarea → clean IMEI list. Throws on a malformed one. */
function parseImeis(raw: string): string[] {
  const list = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const imei of list) {
    if (!IMEI_RE.test(imei)) throw new Error(`"${imei}" is not a valid IMEI/serial.`);
  }
  if (new Set(list).size !== list.length) throw new Error("Duplicate IMEI in the list.");
  return list;
}

/** Mirror of create_product (+ initial quantity; the bot's 11-step /addproduct as one form). */
export async function createProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = await getScope();
  const email = `dashboard:${scope.email}`;
  const shopId = String(formData.get("shop_id") ?? "");
  if (!scope.shopIds.includes(shopId)) return { ok: false, error: "Unknown shop." };

  try {
    const fields = productFields(formData);
    const quantity = parseQuantity(String(formData.get("quantity") ?? "0"));
    const imeis = parseImeis(String(formData.get("imeis") ?? ""));
    const { data, error } = await db
      .from("products")
      .insert({ ...fields, shop_id: shopId, quantity })
      .select("id,product_number")
      .single();
    if (error || !data) return { ok: false, error: "Could not save the product." };
    if (imeis.length > 0) {
      await db
        .from("product_units")
        .insert(imeis.map((imei) => ({ shop_id: shopId, product_id: data.id, imei })));
    }
    await audit(email, "dash_product_new", shopId, { args: [data.product_number] });
    revalidatePath("/inventory");
    return { ok: true, message: "Product added." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid input." };
  }
}

/** Stock intake WITH IMEIs: units land in the ledger, quantity bumps by the same count. */
export async function addUnits(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  const productId = String(formData.get("product_id") ?? "");
  const product = await ownProduct(shopIds, productId);
  if (!product) return { ok: false, error: "Product not found." };

  let imeis: string[];
  try {
    imeis = parseImeis(String(formData.get("imeis") ?? ""));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid IMEI list." };
  }
  if (imeis.length === 0) return { ok: false, error: "Enter at least one IMEI." };

  const { error } = await db
    .from("product_units")
    .insert(imeis.map((imei) => ({ shop_id: product.shop_id, product_id: product.id, imei })));
  if (error) return { ok: false, error: "An IMEI in the list already exists in this shop." };

  await db.rpc("decrement_stock", {
    p_id: product.id,
    p_shop: product.shop_id,
    n: -imeis.length, // negative n restocks
  });
  await audit(email, "dash_stock_adj", product.shop_id, {
    args: [product.product_number, imeis.length],
  });
  revalidatePath(`/inventory/${product.id}`);
  revalidatePath("/inventory");
  return { ok: true, message: `${imeis.length} unit(s) added to stock.` };
}

/** Fix a typo'd IMEI: only an in-stock unit can be removed; stock count is untouched
 *  (the unit ledger is parallel — products.quantity stays the source of truth). */
export async function deleteUnit(unitId: string): Promise<ActionResult> {
  const { shopIds } = await actor();
  const { data } = await db
    .from("product_units")
    .delete()
    .eq("id", unitId)
    .eq("status", "in_stock")
    .in("shop_id", shopIds)
    .select("id");
  if (!data?.length) return { ok: false, error: "Unit not found or already sold." };
  revalidatePath("/inventory");
  return { ok: true, message: "IMEI removed." };
}

/** Full edit (PLAN §5.3 "exists (new surface)") — same validators as create. */
export async function updateProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  const productId = String(formData.get("product_id") ?? "");
  const product = await ownProduct(shopIds, productId);
  if (!product) return { ok: false, error: "Product not found." };

  try {
    const fields = productFields(formData);
    await db.from("products").update(fields).eq("id", product.id).eq("shop_id", product.shop_id);
    await audit(email, "dash_product_edit", product.shop_id, { args: [product.product_number] });
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${product.id}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid input." };
  }
}

/** Mirror of set_boost; 0 = unboost. */
export async function setBoost(productId: string, level: number): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  if (!Number.isInteger(level) || level < 0 || level > 10) {
    return { ok: false, error: "Boost must be 0–10." };
  }
  const product = await ownProduct(shopIds, productId);
  if (!product) return { ok: false, error: "Product not found." };
  await db.from("products").update({ boost_level: level }).eq("id", product.id);
  await audit(email, level === 0 ? "kunboost" : "kboost", product.shop_id, { args: [level] });
  revalidatePath(`/inventory/${product.id}`);
  revalidatePath("/inventory");
  return { ok: true, message: level === 0 ? "Boost cleared." : `Boost set to ${level}.` };
}

/** Mirror of add_tags/remove_tag: one toggle per whitelisted tag chip. */
export async function toggleTag(productId: string, tag: string): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  if (!(VALID_TAGS as readonly string[]).includes(tag)) return { ok: false, error: "Unknown tag." };
  const product = await ownProduct(shopIds, productId);
  if (!product) return { ok: false, error: "Product not found." };

  const has = product.tags.includes(tag);
  const tags = has ? product.tags.filter((t) => t !== tag) : [...product.tags, tag];
  await db.from("products").update({ tags }).eq("id", product.id);
  await audit(email, has ? "kuntag" : "ktag", product.shop_id, { args: [tag] });
  revalidatePath(`/inventory/${product.id}`);
  revalidatePath("/inventory");
  return { ok: true };
}

/** Mirror of toggle_featured. */
export async function toggleFeatured(productId: string): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  const product = await ownProduct(shopIds, productId);
  if (!product) return { ok: false, error: "Product not found." };
  await db.from("products").update({ is_featured: !product.is_featured }).eq("id", product.id);
  await audit(email, "kfeature", product.shop_id, { args: [] });
  revalidatePath(`/inventory/${product.id}`);
  revalidatePath("/inventory");
  return { ok: true, message: product.is_featured ? "Unfeatured." : "Featured." };
}

/** Quick stock ± via the atomic decrement RPC (negative n restocks; can't go below 0). */
export async function adjustStock(productId: string, delta: number): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  if (!Number.isInteger(delta) || delta === 0) return { ok: false, error: "Invalid amount." };
  const product = await ownProduct(shopIds, productId);
  if (!product) return { ok: false, error: "Product not found." };

  const { data, error } = await db.rpc("decrement_stock", {
    p_id: product.id,
    p_shop: product.shop_id,
    n: -delta, // delta +1 = restock 1 → decrement by −1
  });
  if (error || !data) return { ok: false, error: "Stock can't go below 0." };
  if (delta < 0) {
    const shop = await shopForNotify(product.shop_id);
    if (shop) await notifyLowStock(shop, product.id);
  }
  await audit(email, "dash_stock_adj", product.shop_id, {
    args: [product.product_number, delta],
  });
  revalidatePath(`/inventory/${product.id}`);
  revalidatePath("/inventory");
  return { ok: true };
}

/** Delete, blocked while any order references it (PLAN §5.3 NEW rule). */
export async function deleteProduct(productId: string): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  const product = await ownProduct(shopIds, productId);
  if (!product) return { ok: false, error: "Product not found." };

  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("product_id", product.id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${count} order(s) reference this product — it can't be deleted. Set stock to 0 instead.`,
    };
  }

  // Storage cleanup: everything under {shop_id}/{product_id}/ in shop-media.
  const prefix = `${product.shop_id}/${product.id}`;
  const { data: objects } = await db.storage.from("shop-media").list(prefix);
  if (objects && objects.length > 0) {
    await db.storage.from("shop-media").remove(objects.map((o) => `${prefix}/${o.name}`));
  }
  await db.from("products").delete().eq("id", product.id).eq("shop_id", product.shop_id);
  await audit(email, "dash_product_delete", product.shop_id, { args: [product.product_number] });
  revalidatePath("/inventory");
  return { ok: true, message: "Product deleted." };
}
