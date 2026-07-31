// The only way this app changes stock (migration 034).
//
// move_stock updates products.quantity AND writes the stock_moves journal row in one transaction,
// refusing anything that would take stock below zero — the atomicity migration 003 gave, plus the
// history it never kept. Going around it (a direct UPDATE on products.quantity) desyncs the journal
// silently; nothing here does, and the reconciliation query in scripts/pos_integration_check.py is
// what would catch it if something started.
import "server-only";
import { db } from "./db";

/** Why the stock moved. Small on purpose — a vocabulary nobody can read is not a ledger. */
export type StockReason =
  | "sale" // sold, either channel — ref points at the order or counter sale
  | "cancel" // a confirmed order was cancelled and the unit came back
  | "void" // a completed counter sale was reversed
  | "rollback" // a checkout failed halfway; what was already taken went back
  | "gift" // a free-gift offer consumed a unit
  | "intake" // units arrived (IMEIs added, manual restock)
  | "adjust"; // a human corrected the count

/**
 * `delta` is the ledger's sign: negative takes stock out, positive puts it back. Returns false when
 * the move was refused — unknown product, wrong shop, or it would go negative.
 */
export async function moveStock(
  shopId: string,
  productId: string,
  delta: number,
  reason: StockReason,
  actor: string,
  ref?: { table: string; id?: string },
): Promise<boolean> {
  const { data, error } = await db.rpc("move_stock", {
    p_id: productId,
    p_shop: shopId,
    p_delta: delta,
    p_reason: reason,
    p_actor: actor,
    p_ref_table: ref?.table ?? null,
    p_ref_id: ref?.id ?? null,
  });
  return !error && Boolean(data);
}
