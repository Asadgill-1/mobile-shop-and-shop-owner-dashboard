"use server";

// POS counter sales — writes into the SAME counter_sales table the bots' photo flow uses
// (backend orders/counter_sales.py), so /profit merge_counter sees web sales unchanged.
// Void = reversing negative row (append-only, migration 022), never delete.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { notifyLowStock, shopForNotify } from "@/lib/notify";
import { dubaiDateISO } from "@/lib/period";
import { vatFromInclusive } from "@/lib/money";
import { productCode, type InvoiceItem } from "@/lib/types";
import type { ActionResult } from "./orders";

/** FTA: above this a full tax invoice (customer name + address) is required. */
const FULL_INVOICE_THRESHOLD = 10_000;
const IMEI_RE = /^[0-9A-Za-z-]{8,20}$/; // 15-digit IMEIs and letter serials both pass

export interface CartLine {
  product_id: string;
  quantity: number;
  unit_price: number;
  imeis: string[];
}

export interface CheckoutInput {
  shop_id: string;
  payment_method: "cash" | "card";
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_trn?: string;
  lines: CartLine[];
}

export type CheckoutResult = ActionResult & { invoiceId?: string };

interface LineProduct {
  id: string;
  category: string;
  brand: string;
  model: string;
  color: string | null;
  product_number: number | null;
}

export async function checkoutSale(input: CheckoutInput): Promise<CheckoutResult> {
  const scope = await getScope();
  const email = `dashboard:${scope.email}`;
  const shopId = input.shop_id;
  if (!scope.shopIds.includes(shopId)) return { ok: false, error: "Unknown shop." };
  if (!["cash", "card"].includes(input.payment_method)) {
    return { ok: false, error: "Pick cash or card." };
  }
  if (!input.lines?.length) return { ok: false, error: "The cart is empty." };

  // --- validate lines against real products (tenant-guarded) ---
  const { data: prods } = await db
    .from("products")
    .select("id,category,brand,model,color,product_number")
    .eq("shop_id", shopId)
    .in("id", input.lines.map((l) => l.product_id));
  const byId = new Map<string, LineProduct>((prods ?? []).map((p) => [p.id, p]));

  const allImeis: string[] = [];
  for (const line of input.lines) {
    const p = byId.get(line.product_id);
    if (!p) return { ok: false, error: "Product not found." };
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      return { ok: false, error: `${p.brand} ${p.model}: quantity must be a whole number above 0.` };
    }
    if (!Number.isFinite(line.unit_price) || line.unit_price < 0) {
      return { ok: false, error: `${p.brand} ${p.model}: invalid price.` };
    }
    line.imeis = (line.imeis ?? []).map((s) => s.trim()).filter(Boolean);
    for (const imei of line.imeis) {
      if (!IMEI_RE.test(imei)) return { ok: false, error: `"${imei}" is not a valid IMEI/serial.` };
    }
    // IMEI compulsory for phones/tablets — one per unit sold (user rule; niche-POS parity).
    if (["Mobile", "Tablet"].includes(p.category) && line.imeis.length !== line.quantity) {
      return {
        ok: false,
        error: `${p.brand} ${p.model}: enter ${line.quantity} IMEI(s) — scan the box or pick from stock.`,
      };
    }
    allImeis.push(...line.imeis);
  }
  if (new Set(allImeis).size !== allImeis.length) {
    return { ok: false, error: "The same IMEI appears twice in the cart." };
  }

  const total = input.lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const customerName = (input.customer_name ?? "").trim() || null;
  const customerAddress = (input.customer_address ?? "").trim() || null;
  if (total > FULL_INVOICE_THRESHOLD && (!customerName || !customerAddress)) {
    return {
      ok: false,
      error: `Sales above AED ${FULL_INVOICE_THRESHOLD.toLocaleString()} need a FULL tax invoice — customer name and address are required (FTA rule).`,
    };
  }

  // --- IMEI integrity BEFORE any stock moves: a sold IMEI can't sell twice ---
  let unitRows: { id: string; imei: string; status: string; product_id: string }[] = [];
  if (allImeis.length > 0) {
    const { data } = await db
      .from("product_units")
      .select("id,imei,status,product_id")
      .eq("shop_id", shopId)
      .in("imei", allImeis);
    unitRows = data ?? [];
    const sold = unitRows.find((u) => u.status === "sold");
    if (sold) return { ok: false, error: `IMEI ${sold.imei} is already sold.` };
  }
  const unitByImei = new Map(unitRows.map((u) => [u.imei, u]));

  // --- stock: atomic RPC per line; on failure, restock what already went through ---
  const decremented: { product_id: string; quantity: number }[] = [];
  for (const line of input.lines) {
    const { data: ok, error } = await db.rpc("decrement_stock", {
      p_id: line.product_id,
      p_shop: shopId,
      n: line.quantity,
    });
    if (error || !ok) {
      for (const d of decremented) {
        await db.rpc("decrement_stock", { p_id: d.product_id, p_shop: shopId, n: -d.quantity });
      }
      const p = byId.get(line.product_id)!;
      return { ok: false, error: `${p.brand} ${p.model}: not enough stock.` };
    }
    decremented.push({ product_id: line.product_id, quantity: line.quantity });
  }

  // --- counter_sales rows (sold_price is PER UNIT; recorded_by defaults to 0) ---
  const soldOn = dubaiDateISO();
  const { data: sales, error: insErr } = await db
    .from("counter_sales")
    .insert(
      input.lines.map((l) => ({
        shop_id: shopId,
        product_id: l.product_id,
        quantity: l.quantity,
        sold_price: l.unit_price.toFixed(2),
        sold_on: soldOn,
        sold_by: email,
        payment_method: input.payment_method,
        discrepancy: false,
      })),
    )
    .select("id,product_id");
  if (insErr || !sales) {
    for (const d of decremented) {
      await db.rpc("decrement_stock", { p_id: d.product_id, p_shop: shopId, n: -d.quantity });
    }
    return { ok: false, error: "Could not record the sale." };
  }
  const saleIdByProduct = new Map(sales.map((s) => [s.product_id, s.id]));

  // --- units: mark stocked IMEIs sold; free-typed IMEIs are late-captured as sold units ---
  const now = new Date().toISOString();
  for (const line of input.lines) {
    const saleId = saleIdByProduct.get(line.product_id) ?? null;
    for (const imei of line.imeis) {
      const existing = unitByImei.get(imei);
      if (existing) {
        await db
          .from("product_units")
          .update({ status: "sold", counter_sale_id: saleId, sold_at: now })
          .eq("id", existing.id);
      } else {
        await db.from("product_units").insert({
          shop_id: shopId,
          product_id: line.product_id,
          imei,
          status: "sold",
          counter_sale_id: saleId,
          sold_at: now,
        });
      }
    }
  }

  // --- tax invoice (DET: every sale gets a receipt) ---
  const items: InvoiceItem[] = input.lines.map((l) => {
    const p = byId.get(l.product_id)!;
    return {
      desc: `${productCode(p.product_number)} · ${p.brand} ${p.model}${p.color ? ` ${p.color}` : ""}`,
      qty: l.quantity,
      unit_price: l.unit_price,
      line_total: Math.round(l.unit_price * l.quantity * 100) / 100,
      imeis: l.imeis,
    };
  });
  const vat = vatFromInclusive(total);
  const { data: invNo } = await db.rpc("next_invoice_number", { p_shop: shopId });
  const { data: invoice } = await db
    .from("invoices")
    .insert({
      shop_id: shopId,
      invoice_number: invNo,
      source: "counter",
      counter_sale_ids: sales.map((s) => s.id),
      customer_name: customerName,
      customer_phone: (input.customer_phone ?? "").trim() || null,
      customer_address: customerAddress,
      customer_trn: (input.customer_trn ?? "").trim() || null,
      items,
      subtotal: (total - vat).toFixed(2),
      vat_amount: vat.toFixed(2),
      total: total.toFixed(2),
      created_by: email,
    })
    .select("id,invoice_number")
    .single();

  const itemCount = input.lines.reduce((s, l) => s + l.quantity, 0);
  await audit(email, "dcsale", shopId, { args: [itemCount] });
  if (invoice) {
    await audit(email, "dinv", shopId, { args: [String(invoice.invoice_number).padStart(6, "0")] });
  }
  const shop = await shopForNotify(shopId);
  if (shop) for (const d of decremented) await notifyLowStock(shop, d.product_id);

  revalidatePath("/pos");
  revalidatePath("/inventory");
  revalidatePath("/invoices");
  return {
    ok: true,
    message: invoice ? `Sale recorded — invoice INV-${String(invoice.invoice_number).padStart(6, "0")}.` : "Sale recorded.",
    invoiceId: invoice?.id,
  };
}

/** Reverse one sale row: negative counter row + restock + units back to stock. */
export async function voidSale(counterSaleId: string): Promise<ActionResult> {
  const scope = await getScope();
  const email = `dashboard:${scope.email}`;

  const { data: sale } = await db
    .from("counter_sales")
    .select("id,shop_id,product_id,quantity,sold_price")
    .eq("id", counterSaleId)
    .in("shop_id", scope.shopIds)
    .maybeSingle();
  if (!sale) return { ok: false, error: "Sale not found." };
  if (sale.quantity < 0) return { ok: false, error: "That row is itself a void." };

  // ponytail: the reversal links back through sold_by ("void:{id} ...") — no link column needed.
  const { data: existing } = await db
    .from("counter_sales")
    .select("id", { count: "exact", head: false })
    .like("sold_by", `void:${sale.id}%`)
    .limit(1);
  if (existing && existing.length > 0) return { ok: false, error: "Already voided." };

  const { error } = await db.from("counter_sales").insert({
    shop_id: sale.shop_id,
    product_id: sale.product_id,
    quantity: -sale.quantity,
    sold_price: sale.sold_price,
    sold_on: dubaiDateISO(), // the money moves back TODAY — today's Z-report shows it
    sold_by: `void:${sale.id} ${email}`,
    discrepancy: false,
  });
  if (error) return { ok: false, error: "Could not void the sale." };

  await db.rpc("decrement_stock", {
    p_id: sale.product_id,
    p_shop: sale.shop_id,
    n: -sale.quantity, // negative n restocks
  });
  await db
    .from("product_units")
    .update({ status: "in_stock", counter_sale_id: null, sold_at: null })
    .eq("counter_sale_id", sale.id);

  await audit(email, "dvoid", sale.shop_id, { args: [sale.id.slice(0, 8)] });
  revalidatePath("/pos");
  revalidatePath("/inventory");
  return { ok: true, message: "Sale voided — stock restored." };
}
