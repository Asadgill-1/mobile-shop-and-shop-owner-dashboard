"use server";

// Chat actions — dashboard reply + handover, no bridge (PLAN §3.3 replacement).
// Reply mirrors escalations/service.py::reply — deliver FIRST, archive only on success
// (an undelivered line must never enter the transcript or the AI's memory).
// Handover mirrors resolve_escalation: close the DB row; the backend's still_frozen
// check unfreezes the AI lazily on the customer's next message.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { sendTelegram, shopForNotify } from "@/lib/notify";
import type { ActionResult } from "./orders";

export async function replyToCustomer(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = await getScope();
  const shopId = String(formData.get("shop_id") ?? "");
  const identity = String(formData.get("identity") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!scope.shopIds.includes(shopId)) return { ok: false, error: "Unknown shop." };
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > 4000) return { ok: false, error: "Message too long (4000 max)." };

  const shop = await shopForNotify(shopId);
  if (!shop) return { ok: false, error: "Shop not found." };

  const sent = await sendTelegram(shop.telegram_customer_bot_token, identity, text);
  if (!sent) {
    return { ok: false, error: "Could not deliver — the customer may have blocked the bot." };
  }
  try {
    await db.from("messages").insert({
      shop_id: shopId,
      identity,
      role: "shopkeeper", // replays as an assistant turn (context.py) — the shop's voice
      content: text,
      relay_pending: true, // sync_relay pulls it into the AI's session (migration 021)
    });
  } catch {
    // archive is best-effort, like store.save_message
  }
  await audit(`dashboard:${scope.email}`, "dreply", shopId, { args: [identity] });
  revalidatePath(`/chats/${encodeURIComponent(identity)}`);
  return { ok: true, message: "Sent." };
}

/** "Return to AI" — close the open escalation row(s); AI resumes on the customer's next
 *  message via the backend's DB-verified freeze check. Returns ok even when nothing was
 *  open (idempotent, like resolve_escalation). */
export async function resolveEscalation(shopId: string, identity: string): Promise<ActionResult> {
  const scope = await getScope();
  if (!scope.shopIds.includes(shopId)) return { ok: false, error: "Unknown shop." };

  const { error } = await db
    .from("pending_escalations")
    .update({ resolved_at: new Date().toISOString() })
    .eq("shop_id", shopId) // tenant guard: never resolve another shop's row
    .eq("phone", identity)
    .is("resolved_at", null);
  if (error) return { ok: false, error: "Could not resolve the escalation." };

  await audit(`dashboard:${scope.email}`, "dhandover", shopId, { args: [identity] });
  revalidatePath(`/chats/${encodeURIComponent(identity)}`);
  revalidatePath("/chats");
  return { ok: true, message: "Returned to the AI — it resumes on the customer's next message." };
}
