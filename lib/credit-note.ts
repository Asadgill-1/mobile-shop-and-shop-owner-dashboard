// Tax credit notes (migration 029). A reversed supply does not erase its tax invoice — the
// original document stands and a credit note referencing it reverses the VAT. Without this, every
// void and every cancel-after-invoice left its output VAT standing in the reports.
//
// Shape mirrors migration 022's void trick one table up: the note is an ordinary invoices row with
// NEGATIVE amounts and credit_of set, so every existing `sum(vat_amount)` nets out untouched.
import "server-only";
import { db } from "./db";
import { dubaiDateISO } from "./period";
import { invoiceRef, type InvoiceItem } from "./types";

export interface CreditNoteResult {
  ok: boolean;
  ref?: string;
  /** Set when it was already reversed — not an error, the caller just has nothing to do. */
  skipped?: "already-credited";
  error?: string;
}

const neg = (v: string | number) => (-Math.abs(Number(v))).toFixed(2);

function refOf(row: { issued_at: string; day_seq: number | null; invoice_number: number }): string {
  return invoiceRef(row.issued_at, row.day_seq, row.invoice_number);
}

/**
 * Reverse `invoiceId` with a credit note. Idempotent: a second call returns
 * `skipped: "already-credited"` rather than refunding the VAT twice (the unique index on
 * credit_of enforces the same thing in the database).
 */
export async function issueCreditNote(
  invoiceId: string,
  reason: string,
  actor: string,
): Promise<CreditNoteResult> {
  const { data: original } = await db
    .from("invoices")
    // One line on purpose: splitting a select string breaks supabase-js type inference.
    .select("id,shop_id,source,order_id,counter_sale_ids,customer_name,customer_phone,customer_address,customer_trn,items,subtotal,discount,vat_rate,vat_amount,total,credit_of")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!original) return { ok: false, error: "Invoice not found." };
  if (original.credit_of) return { ok: false, error: "That document is itself a credit note." };

  const { data: existing } = await db
    .from("invoices")
    .select("id,invoice_number,day_seq,issued_at")
    .eq("credit_of", invoiceId)
    .maybeSingle();
  if (existing) return { ok: true, skipped: "already-credited", ref: refOf(existing) };

  const { data: invNo, error: rpcErr } = await db.rpc("next_invoice_number", {
    p_shop: original.shop_id,
  });
  if (rpcErr || !invNo) return { ok: false, error: "Could not allocate a credit note number." };
  const { data: daySeq } = await db.rpc("next_day_seq", {
    p_shop: original.shop_id,
    p_kind: "invoice",
    p_day: dubaiDateISO(),
  });

  // Line items reverse too, so the printed note reads as the mirror of what it credits.
  const items = ((original.items ?? []) as InvoiceItem[]).map((l) => ({
    ...l,
    qty: -Math.abs(l.qty),
    line_total: Number(neg(l.line_total)),
  }));

  const { data: note, error } = await db
    .from("invoices")
    .insert({
      shop_id: original.shop_id,
      invoice_number: invNo,
      day_seq: daySeq ?? null,
      source: original.source,
      order_id: original.order_id,
      counter_sale_ids: original.counter_sale_ids,
      customer_name: original.customer_name,
      customer_phone: original.customer_phone,
      customer_address: original.customer_address,
      customer_trn: original.customer_trn,
      items,
      subtotal: neg(original.subtotal),
      discount: neg(original.discount), // reverses with the rest, so discount reports net out
      vat_rate: original.vat_rate,
      vat_amount: neg(original.vat_amount),
      total: neg(original.total),
      credit_of: invoiceId,
      reason,
      created_by: actor,
    })
    .select("id,invoice_number,day_seq,issued_at")
    .single();
  if (error || !note) return { ok: false, error: "Could not issue the credit note." };

  return { ok: true, ref: refOf(note) };
}

/** The live invoice covering a counter sale, if one was issued. */
export async function invoiceForCounterSale(saleId: string): Promise<string | null> {
  const { data } = await db
    .from("invoices")
    .select("id")
    .contains("counter_sale_ids", [saleId])
    .is("credit_of", null)
    .maybeSingle();
  return data?.id ?? null;
}

/** The live invoice covering an order, if one was issued. */
export async function invoiceForOrder(orderId: string): Promise<string | null> {
  const { data } = await db
    .from("invoices")
    .select("id")
    .eq("order_id", orderId)
    .is("credit_of", null)
    .maybeSingle();
  return data?.id ?? null;
}
