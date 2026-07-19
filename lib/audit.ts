// SHARED with owner-dashboard-mobile — edit both (PLAN §3.4)
// Append-only audit trail, same table the bots write (SPEC §16). Best-effort by design.
// Where a dashboard action is the exact twin of a keeper-bot button, it reuses the bot's
// action code (kconf, krej, …) so the owner bot's activity report humanizes it for free.
import "server-only";
import { db } from "./db";

export async function audit(
  actor: string, // "dashboard:{email}"
  action: string,
  shopId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.from("audit_logs").insert({ actor, action, shop_id: shopId, detail });
  } catch {
    // a failed audit must never fail the audited action (audit/service.py)
  }
}
