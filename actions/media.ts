"use server";

// Media upload (PLAN §3.1): server issues a signed upload URL, the browser PUTs the
// file straight to Storage (no Vercel body limits), then attachMedia records the path.
// Paths mirror products/media.py: {shop_id}/{product_id}/{filename}, MAX_IMAGES = 5.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import type { ActionResult } from "./orders";

const MAX_IMAGES = 5;
const BUCKET = "shop-media";

type UploadTicket =
  | { ok: true; path: string; signedUrl: string }
  | { ok: false; error: string };

async function ownProduct(productId: string) {
  const scope = await getScope();
  const { data } = await db
    .from("products")
    .select("id,shop_id,images,video_url,product_number")
    .eq("id", productId)
    .in("shop_id", scope.shopIds)
    .maybeSingle();
  return data ? { product: data, email: `dashboard:${scope.email}` } : null;
}

/** Step 1: a one-time signed PUT URL under the product's tenant prefix. */
export async function getSignedUploadUrl(
  productId: string,
  kind: "image" | "video",
  ext: string,
): Promise<UploadTicket> {
  const own = await ownProduct(productId);
  if (!own) return { ok: false, error: "Product not found." };
  const { product } = own;

  if (kind === "image" && (product.images ?? []).length >= MAX_IMAGES) {
    return { ok: false, error: `Max ${MAX_IMAGES} images per product.` };
  }
  const safeExt = /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : "bin";
  const path = `${product.shop_id}/${product.id}/${kind}_${Date.now()}.${safeExt}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not create an upload URL." };
  return { ok: true, path, signedUrl: data.signedUrl };
}

/** Step 2: after the browser's PUT succeeded, record the path on the product row. */
export async function attachMedia(
  productId: string,
  kind: "image" | "video",
  path: string,
): Promise<ActionResult> {
  const own = await ownProduct(productId);
  if (!own) return { ok: false, error: "Product not found." };
  const { product, email } = own;
  if (!path.startsWith(`${product.shop_id}/${product.id}/`)) {
    return { ok: false, error: "Path does not belong to this product." };
  }

  if (kind === "image") {
    const images = [...(product.images ?? []), path].slice(0, MAX_IMAGES);
    await db.from("products").update({ images }).eq("id", product.id);
  } else {
    await db.from("products").update({ video_url: path }).eq("id", product.id);
  }
  await audit(email, "dash_media", product.shop_id, { args: [product.product_number, kind] });
  revalidatePath(`/inventory/${product.id}`);
  revalidatePath("/inventory");
  return { ok: true, message: kind === "image" ? "Photo added." : "Video added." };
}

/** Remove one image (or the video) from the row and from Storage. */
export async function removeMedia(
  productId: string,
  kind: "image" | "video",
  path: string,
): Promise<ActionResult> {
  const own = await ownProduct(productId);
  if (!own) return { ok: false, error: "Product not found." };
  const { product, email } = own;
  if (!path.startsWith(`${product.shop_id}/${product.id}/`)) {
    return { ok: false, error: "Path does not belong to this product." };
  }

  if (kind === "image") {
    const images = (product.images ?? []).filter((p: string) => p !== path);
    await db.from("products").update({ images }).eq("id", product.id);
  } else {
    await db.from("products").update({ video_url: null }).eq("id", product.id);
  }
  await db.storage.from(BUCKET).remove([path]);
  await audit(email, "dash_media", product.shop_id, {
    args: [product.product_number, `remove_${kind}`],
  });
  revalidatePath(`/inventory/${product.id}`);
  revalidatePath("/inventory");
  return { ok: true, message: "Removed." };
}
