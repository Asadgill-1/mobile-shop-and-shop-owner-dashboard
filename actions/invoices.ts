"use server";

// Invoices for ONLINE orders (POS auto-invoices in actions/pos.ts).
// orders.selling_price is the TOTAL gross; the customer paid selling_price − discount_amount.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { vatFromInclusive } from "@/lib/money";
import { dubaiDateISO } from "@/lib/period";
import { invoiceRef, type InvoiceItem } from "@/lib/types";
import type { ActionResult } from "./orders";

export type InvoiceActionResult = ActionResult & { invoiceId?: string };

const IMEI_RE = /^[0-9A-Za-z-]{8,20}$/;
const SERIALIZED = ["Mobile", "Tablet"]; // IMEI compulsory (same rule as POS checkout)

export async function createInvoiceFromOrder(
  orderId: string,
  imeis: string[] = [],
): Promise<InvoiceActionResult> {
  const scope = await getScope();
  const email = `dashboard:${scope.email}`;

  const { data: order } = await db
    .from("orders")
    .select(
      "id,shop_id,order_number,product_id,status,customer_name,phone,address,quantity,selling_price,discount_amount,delivery_fee,applied_offer,products(brand,model,color,product_number,category)",
    )
    .eq("id", orderId)
    .in("shop_id", scope.shopIds)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "delivered") {
    return { ok: false, error: "Only delivered orders can be invoiced." };
  }

  const { data: existing } = await db
    .from("invoices")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();
  if (existing) return { ok: true, message: "Already invoiced.", invoiceId: existing.id };

  const p = (Array.isArray(order.products) ? order.products[0] : order.products) as {
    brand: string;
    model: string;
    color: string | null;
    product_number: number | null;
    category: string;
  } | null;
  const qty = order.quantity;

  // IMEI capture (023): compulsory for Mobile/Tablet so the customer invoice carries it and the
  // unit ledger (product_units) reflects the online sale, not just walk-ins. Reuses the POS rules.
  const cleanImeis = imeis.map((s) => s.trim()).filter(Boolean);
  if (p && SERIALIZED.includes(p.category)) {
    if (cleanImeis.length !== qty) {
      return { ok: false, error: `Enter ${qty} IMEI(s) for this ${p.category.toLowerCase()} before invoicing.` };
    }
    for (const imei of cleanImeis) {
      if (!IMEI_RE.test(imei)) return { ok: false, error: `"${imei}" is not a valid IMEI/serial.` };
    }
    if (new Set(cleanImeis).size !== cleanImeis.length) {
      return { ok: false, error: "Duplicate IMEI in the list." };
    }
    // no IMEI may already be sold (in this shop)
    const { data: units } = await db
      .from("product_units")
      .select("id,imei,status")
      .eq("shop_id", order.shop_id)
      .in("imei", cleanImeis);
    const sold = (units ?? []).find((u) => u.status === "sold");
    if (sold) return { ok: false, error: `IMEI ${sold.imei} is already sold.` };
    // mark stocked units sold + link the order; late-captured IMEIs insert as sold units
    const byImei = new Map((units ?? []).map((u) => [u.imei, u]));
    const now = new Date().toISOString();
    for (const imei of cleanImeis) {
      const existing = byImei.get(imei);
      if (existing) {
        await db
          .from("product_units")
          .update({ status: "sold", order_id: order.id, sold_at: now })
          .eq("id", existing.id);
      } else {
        await db.from("product_units").insert({
          shop_id: order.shop_id,
          product_id: order.product_id,
          imei,
          status: "sold",
          order_id: order.id,
          sold_at: now,
        });
      }
    }
  }

  const productTotal = Number(order.selling_price) - Number(order.discount_amount || 0);
  const deliveryFee = Number(order.delivery_fee || 0);
  const total = productTotal + deliveryFee; // grand total the customer paid, VAT-inclusive
  const desc = p
    ? `${p.product_number ? `PR${String(p.product_number).padStart(4, "0")} · ` : ""}${p.brand} ${p.model}${p.color ? ` ${p.color}` : ""}`
    : `Order #${order.order_number}`;
  const items: InvoiceItem[] = [
    {
      desc,
      qty,
      unit_price: Math.round((productTotal / qty) * 100) / 100,
      line_total: Math.round(productTotal * 100) / 100,
      ...(cleanImeis.length > 0 ? { imeis: cleanImeis } : {}),
    },
  ];
  // Free gift (023): a 0.00 line so the customer's invoice shows what they received.
  const gift = (order.applied_offer ?? null) as { gift_name?: string } | null;
  if (gift?.gift_name) {
    items.push({ desc: `${gift.gift_name} (free gift)`, qty: 1, unit_price: 0, line_total: 0 });
  }
  if (deliveryFee > 0) {
    items.push({ desc: "Home delivery", qty: 1, unit_price: deliveryFee, line_total: deliveryFee });
  }
  const vat = vatFromInclusive(total);

  const { data: invNo, error: rpcErr } = await db.rpc("next_invoice_number", {
    p_shop: order.shop_id,
  });
  if (rpcErr || !invNo) return { ok: false, error: "Could not allocate an invoice number." };
  // Date-based display ref (023): per-shop-per-Dubai-day sequence for INV-DD-MM-NNN.
  const { data: daySeq } = await db.rpc("next_day_seq", {
    p_shop: order.shop_id,
    p_kind: "invoice",
    p_day: dubaiDateISO(),
  });

  const { data: invoice, error } = await db
    .from("invoices")
    .insert({
      shop_id: order.shop_id,
      invoice_number: invNo,
      day_seq: daySeq ?? null,
      source: "order",
      order_id: order.id,
      customer_name: order.customer_name,
      customer_phone: order.phone,
      customer_address: order.address,
      items,
      subtotal: (total - vat).toFixed(2),
      vat_amount: vat.toFixed(2),
      total: total.toFixed(2),
      created_by: email,
    })
    .select("id,invoice_number,day_seq,issued_at")
    .single();
  if (error || !invoice) return { ok: false, error: "Could not create the invoice." };

  const ref = invoiceRef(invoice.issued_at, invoice.day_seq, invoice.invoice_number);
  // humanizer template is "issued invoice INV-{0}" — pass the ref sans its INV- prefix.
  await audit(email, "dinv", order.shop_id, { args: [ref.replace(/^INV-/, "")] });
  revalidatePath("/invoices");
  revalidatePath(`/orders/${order.id}`);
  return { ok: true, message: `Invoice ${ref} created.`, invoiceId: invoice.id };
}
