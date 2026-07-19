"use server";

// Rider mutations — mirror riders/service.py add_rider + reconcile_cod (incl. the
// trail math and the identical text pushed to the rider).
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { notifyRider, shopForNotify } from "@/lib/notify";
import { num } from "@/lib/money";
import { parsePeriod } from "@/lib/period";
import type { ActionResult } from "./orders";

/** Owner-side onboarding: name + phone; the rider links Telegram themselves via /start. */
export async function addRider(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = await getScope();
  const email = `dashboard:${scope.email}`;
  const shopId = String(formData.get("shop_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!scope.shopIds.includes(shopId)) return { ok: false, error: "Unknown shop." };
  if (!name || !phone) return { ok: false, error: "Name and phone are required." };

  const { error } = await db
    .from("delivery_persons")
    .insert({ shop_id: shopId, name, phone });
  if (error) return { ok: false, error: "Could not add the rider." };
  await audit(email, "dash_rider_add", shopId, { text: name });
  revalidatePath("/riders");
  return {
    ok: true,
    message: `${name} added. They link themselves by pressing /start on the rider bot and sharing this phone number.`,
  };
}

/** Mirror of reconcile_cod: append the handover row, push the identical trail to the rider. */
export async function reconcileCod(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scope = await getScope();
  const email = `dashboard:${scope.email}`;
  const riderId = String(formData.get("rider_id") ?? "");
  const amount = Number(formData.get("amount") ?? NaN);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Handover amount can't be negative." };
  }

  const { data: rider } = await db
    .from("delivery_persons")
    .select("id,shop_id,name,telegram_id")
    .eq("id", riderId)
    .in("shop_id", scope.shopIds) // tenant guard
    .maybeSingle();
  if (!rider) return { ok: false, error: "Rider not found." };

  // cod_trail port: previous balance vs today's collections/handovers (Dubai day).
  const todayStart = parsePeriod("today").start.getTime();
  const { data: rows } = await db
    .from("cod_ledger")
    .select("entry,amount,created_at")
    .eq("shop_id", rider.shop_id)
    .eq("rider_id", rider.id)
    .order("created_at");
  let prevC = 0, prevH = 0, todayC = 0, todayH = 0;
  for (const r of rows ?? []) {
    const a = num(r.amount);
    const isToday = new Date(r.created_at).getTime() >= todayStart;
    if (r.entry === "collect") { if (isToday) todayC += a; else prevC += a; }
    else { if (isToday) todayH += a; else prevH += a; }
  }
  const previous = prevC - prevH;
  const balance = previous + todayC - todayH;
  const remaining = balance - amount;

  const { error } = await db.from("cod_ledger").insert({
    shop_id: rider.shop_id,
    rider_id: rider.id,
    order_id: null,
    entry: "handover",
    amount: String(amount),
    note: "end-of-day reconcile",
  });
  if (error) return { ok: false, error: "Could not record the handover." };

  const shop = await shopForNotify(rider.shop_id);
  const text =
    `🧾 COD reconcile — ${rider.name} @ ${shop?.name ?? "shop"}\n` +
    `Previous balance: ${previous} AED\n` +
    `+ Today collected: ${todayC} AED\n` +
    (todayH ? `− Earlier handover today: ${todayH} AED\n` : "") +
    `− Handed over now: ${amount} AED\n` +
    `= Remaining with rider: ${remaining} AED`;
  if (rider.telegram_id) await notifyRider(rider.telegram_id, text);

  await audit(email, "krec", rider.shop_id, { args: [] });
  revalidatePath("/riders");
  return { ok: true, message: `Recorded. Remaining with ${rider.name}: ${remaining} AED.` };
}
