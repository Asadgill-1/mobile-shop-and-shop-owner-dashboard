"use server";

// Order lifecycle mutations — each mirrors its orders/service.py twin exactly:
// same guards, same status writes, same customer wording, same audit codes.
// Every action: getScope → tenant-scoped fetch → validate → write → audit →
// best-effort Telegram notify → {ok}|{error} (PLAN §6).
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import {
  notifyCustomer,
  notifyKeepers,
  notifyLowStock,
  notifyRider,
  shopForNotify,
} from "@/lib/notify";
import { num } from "@/lib/money";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const DELIVERY_MSG: Record<string, (num: number, shop: string) => string> = {
  packed: (n) => `📦 Order #${n} is packed and ready to go.`,
  shipped: (n) => `🚚 Order #${n} is on its way to you!`,
  delivered: (n, shop) =>
    `✅ Order #${n} has been delivered. Thank you for shopping with ${shop}! 🙏`,
};
const DELIVERY_FLOW = ["confirmed", "packed", "shipped", "delivered"];
const ASSIGNABLE = ["confirmed", "packed", "shipped"];

async function actor(): Promise<{ email: string; shopIds: string[] }> {
  const scope = await getScope();
  return { email: `dashboard:${scope.email}`, shopIds: scope.shopIds };
}

/** Atomic stock move via the decrement_stock RPC (migration 003). Negative qty restocks. */
async function decrementStock(shopId: string, productId: string, qty: number): Promise<boolean> {
  const { data, error } = await db.rpc("decrement_stock", {
    p_id: productId,
    p_shop: shopId,
    n: qty,
  });
  return !error && Boolean(data);
}

async function setStatus(orderId: string, status: string, changedBy: string): Promise<void> {
  await db.from("orders").update({ status }).eq("id", orderId);
  await db
    .from("order_status_history")
    .insert({ order_id: orderId, status, changed_by: changedBy });
}

interface DraftRow {
  id: string;
  shop_id: string;
  order_number: number;
  phone: string;
  address: string;
  quantity: number;
  selling_price: string;
  discount_amount: string;
  delivery_date: string | null;
  product_id: string;
  status: string;
  customer_name: string;
  special_instructions: string | null;
  products: { brand: string; model: string } | null;
}

async function getOrder(
  shopIds: string[],
  orderId: string,
  status?: string,
): Promise<DraftRow | null> {
  let q = db
    .from("orders")
    .select("*, products(brand,model)")
    .eq("id", orderId)
    .in("shop_id", shopIds);
  if (status) q = q.eq("status", status);
  const { data } = await q.maybeSingle();
  return data as DraftRow | null;
}

/** Mirror of confirm_order: atomic decrement, → confirmed, tell the customer, low-stock ping. */
export async function confirmOrder(orderId: string): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  const draft = await getOrder(shopIds, orderId, "draft");
  if (!draft) return { ok: false, error: "This draft was already decided or doesn't exist." };

  if (!(await decrementStock(draft.shop_id, draft.product_id, draft.quantity))) {
    return { ok: false, error: "Out of stock — it sold out between draft and confirm." };
  }
  await setStatus(draft.id, "confirmed", email);

  const shop = await shopForNotify(draft.shop_id);
  const net = num(draft.selling_price) - num(draft.discount_amount);
  const name =
    `${draft.products?.brand ?? ""} ${draft.products?.model ?? ""}`.trim() || "your order";
  if (shop) {
    await notifyCustomer(
      shop,
      draft.phone,
      `✅ Order #${draft.order_number} confirmed!\n` +
        `${draft.quantity}× ${name} — ${net} AED\n` +
        `Deliver to: ${draft.address}` +
        (draft.delivery_date ? `\nDelivery: ${draft.delivery_date}` : "") +
        `\nThank you! 🙏`,
    );
    await notifyLowStock(shop, draft.product_id);
  }
  await audit(email, "kconf", draft.shop_id, { args: [draft.order_number] });
  revalidatePath("/orders");
  revalidatePath(`/orders/${draft.id}`);
  revalidatePath("/");
  return { ok: true, message: `Order #${draft.order_number} confirmed — customer notified.` };
}

/** Mirror of reject_order: → cancelled, reason lands in history.changed_by (owner report reads it).
    The customer is NOT cold-messaged — the AI keeps serving them (design #2). */
export async function rejectOrder(orderId: string, formData: FormData): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  const reason = String(formData.get("reason") ?? "").trim();
  const draft = await getOrder(shopIds, orderId, "draft");
  if (!draft) return { ok: false, error: "This draft was already decided or doesn't exist." };

  await setStatus(draft.id, "cancelled", reason || "rejected by shop");
  await audit(email, "krej", draft.shop_id, { args: [draft.order_number] });
  revalidatePath("/orders");
  revalidatePath(`/orders/${draft.id}`);
  revalidatePath("/");
  return { ok: true, message: `Order #${draft.order_number} rejected.` };
}

/** Mirror of advance_delivery: one step down the chain, customer told at each step. */
export async function advanceDelivery(orderId: string, target: string): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  if (!(target in DELIVERY_MSG)) return { ok: false, error: "Invalid step." };
  const order = await getOrder(shopIds, orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (DELIVERY_FLOW.indexOf(target) !== DELIVERY_FLOW.indexOf(order.status) + 1) {
    return { ok: false, error: `Can't move a '${order.status}' order to '${target}' — one step at a time.` };
  }

  await setStatus(order.id, target, email);
  const shop = await shopForNotify(order.shop_id);
  if (shop) await notifyCustomer(shop, order.phone, DELIVERY_MSG[target](order.order_number, shop.name));
  await audit(email, "kdup", order.shop_id, { args: [order.order_number, target] });
  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  return { ok: true, message: `Order #${order.order_number} → ${target}.` };
}

/** Mirror of assign_delivery: rider + cod + custody 'offered', push with working Accept buttons. */
export async function assignDelivery(orderId: string, formData: FormData): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  const riderId = String(formData.get("rider_id") ?? "");
  const order = await getOrder(shopIds, orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (!ASSIGNABLE.includes(order.status)) {
    return { ok: false, error: `Order is '${order.status}' — assign a rider to a confirmed order.` };
  }
  const { data: rider } = await db
    .from("delivery_persons")
    .select("id,name,phone,telegram_id")
    .eq("id", riderId)
    .eq("shop_id", order.shop_id) // tenant guard, mirror get_rider
    .maybeSingle();
  if (!rider) return { ok: false, error: "Rider not found." };

  const cod = num(order.selling_price) - num(order.discount_amount);
  await db
    .from("orders")
    .update({ rider_id: rider.id, cod_amount: String(cod), custody: "offered" })
    .eq("id", order.id);

  let notified = false;
  if (rider.telegram_id) {
    // Outstanding balance = Σcollect − Σhandover (cod_balance)
    const { data: ledger } = await db
      .from("cod_ledger")
      .select("entry,amount")
      .eq("shop_id", order.shop_id)
      .eq("rider_id", rider.id);
    const outstanding = (ledger ?? []).reduce(
      (a, r) => a + (r.entry === "collect" ? num(r.amount) : -num(r.amount)),
      0,
    );
    const shop = await shopForNotify(order.shop_id);
    const item =
      `${order.products?.brand ?? ""} ${order.products?.model ?? ""}`.trim() || "item";
    notified = await notifyRider(
      rider.telegram_id,
      `🛵 New delivery — order #${order.order_number} (${shop?.name ?? "shop"})\n` +
        `Customer: ${order.customer_name} (${order.phone})\n` +
        `Item: ${item} ×${order.quantity}\n` +
        `Address: ${order.address}` +
        (order.delivery_date ? `\nWhen: ${order.delivery_date}` : "") +
        (order.special_instructions ? `\nNote: ${order.special_instructions}` : "") +
        `\n\n💵 Collect (COD): ${cod} AED` +
        `\n📊 Cash you already hold: ${outstanding} AED` +
        `\n\nTap below — or /accept ${order.order_number} / /notreceived ${order.order_number}`,
      {
        inline_keyboard: [
          [
            { text: "✅ Accept (I have it)", callback_data: `racc:${order.order_number}` },
            { text: "❌ Not received", callback_data: `rnrx:${order.order_number}` },
          ],
        ],
      },
    );
  }
  await audit(email, "kasgr", order.shop_id, { args: [order.order_number] });
  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  return {
    ok: true,
    message: notified
      ? `Assigned to ${rider.name} — rider notified.`
      : `Assigned to ${rider.name}. Rider not reached — they may not have pressed /start yet.`,
  };
}

/** Dashboard cancel (PLAN §5.2): remarks mandatory; restores stock for post-confirm orders,
    mirroring the rider's cancel_delivery. */
export async function cancelOrder(orderId: string, formData: FormData): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  const remarks = String(formData.get("remarks") ?? "").trim();
  if (!remarks) return { ok: false, error: "Remarks are required to cancel an order." };
  const order = await getOrder(shopIds, orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "cancelled" || order.status === "delivered") {
    return { ok: false, error: `Order is already ${order.status}.` };
  }

  await setStatus(order.id, "cancelled", email);
  await db.from("orders").update({ cancel_remarks: remarks }).eq("id", order.id);
  if (ASSIGNABLE.includes(order.status)) {
    // stock was decremented at confirm — put it back (negative n increments)
    await decrementStock(order.shop_id, order.product_id, -order.quantity);
  }
  await audit(email, "dash_cancel", order.shop_id, {
    args: [order.order_number],
    text: remarks,
  });
  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/");
  return { ok: true, message: `Order #${order.order_number} cancelled.` };
}

/** Manual order (PLAN §5.2): lands as a DRAFT so confirm/stock/notify reuse the one pipeline. */
export async function createDraftOrder(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = await getScope();
  const email = `dashboard:${scope.email}`;
  const shopId = String(formData.get("shop_id") ?? "");
  if (!scope.shopIds.includes(shopId)) return { ok: false, error: "Unknown shop." };

  const productId = String(formData.get("product_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const customer = String(formData.get("customer_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const deliveryDate = String(formData.get("delivery_date") ?? "").trim() || null;
  const instructions = String(formData.get("special_instructions") ?? "").trim() || null;

  if (!productId) {
    return { ok: false, error: "Pick a product from the search list." };
  }
  if (!customer || !phone || !address) {
    return { ok: false, error: "Customer name, phone and address are required." };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "Quantity must be a whole number above 0." };
  }
  const { data: product } = await db
    .from("products")
    .select("id,selling_price,quantity,brand,model")
    .eq("id", productId)
    .eq("shop_id", shopId) // tenant guard, mirror get_product
    .maybeSingle();
  if (!product) return { ok: false, error: "Product not found." };
  if (product.quantity < quantity) {
    return { ok: false, error: `Only ${product.quantity} in stock.` };
  }

  const { data: created, error } = await db
    .from("orders")
    .insert({
      shop_id: shopId,
      customer_name: customer,
      phone,
      address,
      product_id: product.id,
      quantity,
      selling_price: String(num(product.selling_price) * quantity),
      discount_amount: "0",
      status: "draft",
      delivery_date: deliveryDate,
      special_instructions: instructions,
    })
    .select("id,order_number")
    .single();
  if (error || !created) return { ok: false, error: "Could not create the order." };
  await db
    .from("order_status_history")
    .insert({ order_id: created.id, status: "draft", changed_by: email });

  await audit(email, "dash_create_draft", shopId, { args: [created.order_number] });
  revalidatePath("/orders");
  return { ok: true, message: `Draft #${created.order_number} created — confirm it to commit stock.` };
}

// --- price requests (ADR-010 rev.: human approves every discount) ---

interface PriceReqRow {
  id: string;
  shop_id: string;
  request_number: number;
  phone: string;
  product_id: string;
  requested_price: string;
}

async function getPriceRequest(
  shopIds: string[],
  requestNumber: number,
): Promise<PriceReqRow | null> {
  const { data } = await db
    .from("price_requests")
    .select("id,shop_id,request_number,phone,product_id,requested_price")
    .in("shop_id", shopIds)
    .eq("request_number", requestNumber)
    .eq("status", "pending")
    .maybeSingle();
  return data as PriceReqRow | null;
}

/** Mirror of approve_price. `customPrice` set = the /custom counter. */
export async function approvePrice(
  requestNumber: number,
  customPrice: number | null,
): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  const req = await getPriceRequest(shopIds, requestNumber);
  if (!req) return { ok: false, error: "This request was already decided or doesn't exist." };

  const { data: product } = await db
    .from("products")
    .select("selling_price")
    .eq("id", req.product_id)
    .eq("shop_id", req.shop_id)
    .maybeSingle();
  if (!product) return { ok: false, error: "Product not found." };

  const price = customPrice ?? num(req.requested_price);
  const list = num(product.selling_price);
  if (!(price > 0 && price <= list)) {
    return { ok: false, error: `Price must be between 0 and the list price (${list} AED).` };
  }

  await db
    .from("price_requests")
    .update({ status: "approved", approved_price: String(price) })
    .eq("id", req.id);
  const shop = await shopForNotify(req.shop_id);
  if (shop) await notifyCustomer(shop, req.phone, `Good news — we can do it for ${price} AED. 🙌`);
  await audit(email, customPrice == null ? "kappr" : "kcust", req.shop_id, {
    args: [requestNumber],
  });
  revalidatePath("/orders");
  revalidatePath("/");
  return { ok: true, message: `Approved at ${price} AED — customer told.` };
}

/** Mirror of deny_price. */
export async function denyPrice(requestNumber: number): Promise<ActionResult> {
  const { email, shopIds } = await actor();
  const req = await getPriceRequest(shopIds, requestNumber);
  if (!req) return { ok: false, error: "This request was already decided or doesn't exist." };

  const { data: product } = await db
    .from("products")
    .select("selling_price")
    .eq("id", req.product_id)
    .eq("shop_id", req.shop_id)
    .maybeSingle();
  await db.from("price_requests").update({ status: "denied" }).eq("id", req.id);
  const shop = await shopForNotify(req.shop_id);
  if (shop && product) {
    await notifyCustomer(
      shop,
      req.phone,
      `${num(product.selling_price)} AED is the best price we can do on this one.`,
    );
  }
  await audit(email, "kdeny", req.shop_id, { args: [requestNumber] });
  revalidatePath("/orders");
  revalidatePath("/");
  return { ok: true, message: "Denied — customer told the list price stands." };
}
