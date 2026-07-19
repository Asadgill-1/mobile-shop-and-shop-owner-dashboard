"use server";

// Invoices for ONLINE orders (POS auto-invoices in actions/pos.ts).
// orders.selling_price is the TOTAL gross; the customer paid selling_price − discount_amount.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { vatFromInclusive } from "@/lib/money";
import type { InvoiceItem } from "@/lib/types";
import type { ActionResult } from "./orders";

export type InvoiceActionResult = ActionResult & { invoiceId?: string };

export async function createInvoiceFromOrder(orderId: string): Promise<InvoiceActionResult> {
  const scope = await getScope();
  const email = `dashboard:${scope.email}`;

  const { data: order } = await db
    .from("orders")
    .select(
      "id,shop_id,order_number,status,customer_name,phone,address,quantity,selling_price,discount_amount,products(brand,model,color,product_number)",
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
  } | null;
  const total = Number(order.selling_price) - Number(order.discount_amount || 0);
  const qty = order.quantity;
  const desc = p
    ? `${p.product_number ? `PR${String(p.product_number).padStart(4, "0")} · ` : ""}${p.brand} ${p.model}${p.color ? ` ${p.color}` : ""}`
    : `Order #${order.order_number}`;
  const items: InvoiceItem[] = [
    {
      desc,
      qty,
      unit_price: Math.round((total / qty) * 100) / 100,
      line_total: Math.round(total * 100) / 100,
    },
  ];
  const vat = vatFromInclusive(total);

  const { data: invNo, error: rpcErr } = await db.rpc("next_invoice_number", {
    p_shop: order.shop_id,
  });
  if (rpcErr || !invNo) return { ok: false, error: "Could not allocate an invoice number." };

  const { data: invoice, error } = await db
    .from("invoices")
    .insert({
      shop_id: order.shop_id,
      invoice_number: invNo,
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
    .select("id,invoice_number")
    .single();
  if (error || !invoice) return { ok: false, error: "Could not create the invoice." };

  await audit(email, "dinv", order.shop_id, {
    args: [String(invoice.invoice_number).padStart(6, "0")],
  });
  revalidatePath("/invoices");
  revalidatePath(`/orders/${order.id}`);
  return { ok: true, message: `Invoice INV-${String(invoice.invoice_number).padStart(6, "0")} created.`, invoiceId: invoice.id };
}
