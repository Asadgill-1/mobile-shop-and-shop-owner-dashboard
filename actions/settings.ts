"use server";

// Mirror of set_negotiation (orders/service.py): whether the AI may raise price
// requests for this shop. Off = the AI holds at list price, no discounts.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertShop, getScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import type { ActionResult } from "./orders";

export async function setNegotiation(shopId: string, enabled: boolean): Promise<ActionResult> {
  const scope = await getScope();
  assertShop(scope, shopId);
  const { error } = await db
    .from("shops")
    .update({ negotiation_enabled: enabled })
    .eq("id", shopId);
  if (error) return { ok: false, error: "Could not save the setting." };
  await audit(`dashboard:${scope.email}`, "kneg", shopId, { args: [enabled ? "on" : "off"] });
  revalidatePath("/settings");
  return { ok: true, message: `Negotiation ${enabled ? "on" : "off"}.` };
}
