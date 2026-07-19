// SHARED with owner-dashboard-mobile — edit both (PLAN §3.4)
// Outbound Telegram + message archive. Mirrors src/app/telegram_bot/notify.py and
// escalations/context.remember: every send is BEST-EFFORT — a Telegram outage or a
// failed archive insert must never fail the DB write it decorates (PLAN §3.5).
//
// Known gap until the bridge (P4): the AI's Redis working memory is on the local PC,
// so dashboard-sent customer messages land in the permanent `messages` archive but
// not in the AI's last-25 session. The bots' own sends do both.
import "server-only";
import { db } from "./db";

export interface TelegramKeyboard {
  inline_keyboard: { text: string; callback_data: string }[][];
}

/** One send via the Bot API. Returns success; never throws. */
export async function sendTelegram(
  token: string | null | undefined,
  chatId: string | number,
  text: string,
  keyboard?: TelegramKeyboard,
): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      }),
    });
    return res.ok; // 403 until the recipient pressed /start — normal, just "not reached"
  } catch {
    return false;
  }
}

/** Shop row with the fields notifications need. Never ship these tokens to the client. */
export interface ShopNotifyRow {
  id: string;
  client_id: string;
  name: string;
  telegram_keeper_bot_token: string | null;
  telegram_customer_bot_token: string | null;
}

export async function shopForNotify(shopId: string): Promise<ShopNotifyRow | null> {
  const { data } = await db
    .from("shops")
    .select("id,client_id,name,telegram_keeper_bot_token,telegram_customer_bot_token")
    .eq("id", shopId)
    .maybeSingle();
  return data as ShopNotifyRow | null;
}

/** Customer send + permanent archive row (Redis session is bridge territory, P4). */
export async function notifyCustomer(
  shop: ShopNotifyRow,
  identity: string,
  text: string,
): Promise<boolean> {
  const sent = await sendTelegram(shop.telegram_customer_bot_token, identity, text);
  try {
    await db
      .from("messages")
      .insert({ shop_id: shop.id, identity, role: "assistant", content: text });
  } catch {
    // archive is best-effort, like store.save_message
  }
  return sent;
}

/** Notify every shopkeeper of a shop on its keeper bot. Returns how many were reached. */
export async function notifyKeepers(shop: ShopNotifyRow, text: string): Promise<number> {
  const { data } = await db.from("shopkeepers").select("telegram_id").eq("shop_id", shop.id);
  let reached = 0;
  for (const sk of data ?? []) {
    if (await sendTelegram(shop.telegram_keeper_bot_token, sk.telegram_id, text)) reached++;
  }
  return reached;
}

export async function notifyRider(
  telegramId: number,
  text: string,
  keyboard?: TelegramKeyboard,
): Promise<boolean> {
  return sendTelegram(process.env.TELEGRAM_RIDER_BOT_TOKEN, telegramId, text, keyboard);
}

/** Low-stock alert — port of orders/service.py notify_low_stock. Call only after stock went DOWN. */
export async function notifyLowStock(shop: ShopNotifyRow, productId: string): Promise<void> {
  try {
    const { data: p } = await db
      .from("products")
      .select("product_number,brand,model,quantity,min_qty")
      .eq("id", productId)
      .eq("shop_id", shop.id)
      .maybeSingle();
    if (!p || p.min_qty <= 0 || p.quantity > p.min_qty) return;

    const ref = p.product_number ? `PR${String(p.product_number).padStart(4, "0")}` : productId;
    const text =
      `⚠️ Low stock — ${shop.name}\n` +
      `${ref} · ${p.brand} ${p.model}\n` +
      `${p.quantity} left (alert at ${p.min_qty}). Time to reorder.`;
    await notifyKeepers(shop, text);

    const { data: client } = await db
      .from("clients")
      .select("telegram_id")
      .eq("id", shop.client_id)
      .maybeSingle();
    if (client?.telegram_id) {
      await sendTelegram(process.env.TELEGRAM_SHOPOWNER_BOT_TOKEN, client.telegram_id, text);
    }
  } catch {
    // an alert that fails must never break the sale that triggered it
  }
}
