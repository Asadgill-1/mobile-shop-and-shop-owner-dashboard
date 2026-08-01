"use server";

// The input side of the VAT return (migration 036): the bills the shop received.
// Header only — a purchase's LINES exist to move stock, and that is phase 6.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertShop, getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { parsePrice } from "@/lib/validate";
import {
  VAT_TREATMENTS,
  recoverableWarning,
  trnError,
  vatVarianceWarning,
  type VatTreatment,
} from "@/lib/vat";
import type { ActionResult } from "./orders";

const BUCKET = "shop-media"; // the private bucket product media already uses (migration 002)
const TREATMENTS = new Set(VAT_TREATMENTS.map((t) => t.value));

export async function addSupplier(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = await getScope();
  const shopId = assertShop(scope, String(formData.get("shop_id") ?? ""));

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "The supplier needs a name." };
  const trn = String(formData.get("trn") ?? "").trim();
  const badTrn = trnError(trn);
  if (badTrn) return { ok: false, error: badTrn };

  const { error } = await db.from("suppliers").insert({
    shop_id: shopId,
    name,
    trn: trn || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
  });
  // suppliers_shop_name_uidx is case-insensitive: two spellings of one supplier would split its
  // history, and its purchase invoices with it.
  if (error?.code === "23505") return { ok: false, error: `"${name}" is already a supplier here.` };
  if (error) return { ok: false, error: "Could not save the supplier." };

  await audit(`dashboard:${scope.email}`, "dash_supplier_new", shopId, { args: [name] });
  revalidatePath("/purchases");
  return { ok: true, message: `${name} added.` };
}

/**
 * Book one supplier bill.
 *
 * Refuses exactly two things: a document that is not a document (no number, no date, a date that
 * hasn't happened) and the SAME document twice. Everything else — VAT that isn't 5% of the net, a
 * recoverable claim with no supplier TRN — is warned about and booked as entered, because the paper
 * is the record and the shop can see the paper.
 */
export async function bookPurchase(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = await getScope();
  const shopId = assertShop(scope, String(formData.get("shop_id") ?? ""));

  const supplierId = String(formData.get("supplier_id") ?? "");
  const { data: supplier } = await db
    .from("suppliers")
    .select("id,name,trn")
    .eq("id", supplierId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!supplier) return { ok: false, error: "Pick a supplier first." };

  const invoiceNo = String(formData.get("supplier_invoice_no") ?? "").trim();
  if (!invoiceNo) return { ok: false, error: "Enter the number printed on the supplier's bill." };

  const invoiceDate = String(formData.get("invoice_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return { ok: false, error: "Enter the bill's date." };
  // Dubai is UTC+4 with no DST, so "today there" is today's date after the shift (lib/period.ts).
  const todayDubai = new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
  if (invoiceDate > todayDubai) {
    return { ok: false, error: "That bill is dated in the future — check the date." };
  }

  const treatment = String(formData.get("vat_treatment") ?? "standard") as VatTreatment;
  if (!TREATMENTS.has(treatment)) return { ok: false, error: "Pick a VAT treatment." };

  let subtotal: number;
  let vat: number;
  try {
    subtotal = parsePrice(String(formData.get("subtotal") ?? ""), "Amount before VAT");
    vat = parsePrice(String(formData.get("vat_amount") ?? "0") || "0", "VAT");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount." };
  }

  const recoverable = formData.get("recoverable") === "on";
  const supplierTrn = supplier.trn ?? "";

  const { error } = await db.from("purchase_invoices").insert({
    shop_id: shopId,
    supplier_id: supplier.id,
    supplier_invoice_no: invoiceNo,
    supplier_trn: supplierTrn || null,
    invoice_date: invoiceDate,
    subtotal: subtotal.toFixed(2),
    vat_amount: vat.toFixed(2),
    vat_treatment: treatment,
    recoverable,
    scan_path: String(formData.get("scan_path") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    created_by: `dashboard:${scope.email}`,
  });
  // THE control (036): the same bill reaching the shop twice — once by WhatsApp, once in the box —
  // and being booked by two people is the commonest input-VAT error there is.
  if (error?.code === "23505") {
    return {
      ok: false,
      error: `${supplier.name}'s bill ${invoiceNo} is already booked — claiming it twice is what the FTA looks for.`,
    };
  }
  if (error) return { ok: false, error: "Could not book the purchase." };

  await audit(`dashboard:${scope.email}`, "dash_purchase", shopId, {
    args: [supplier.name, invoiceNo, vat.toFixed(2)],
  });
  revalidatePath("/purchases");

  const warning =
    vatVarianceWarning(subtotal, vat, treatment) ?? recoverableWarning(recoverable, supplierTrn);
  return {
    ok: true,
    message: `Booked ${supplier.name} ${invoiceNo}.${warning ? ` ⚠ ${warning}` : ""}`,
  };
}

/** A one-time signed PUT for the bill's photo — same flow as product media (actions/media.ts). */
export async function getScanUploadUrl(
  shopId: string,
  ext: string,
): Promise<{ ok: true; path: string; signedUrl: string } | { ok: false; error: string }> {
  const scope = await getScope();
  assertShop(scope, shopId);
  const safeExt = /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : "bin";
  const path = `${shopId}/purchases/${Date.now()}.${safeExt}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not create an upload URL." };
  return { ok: true, path, signedUrl: data.signedUrl };
}
