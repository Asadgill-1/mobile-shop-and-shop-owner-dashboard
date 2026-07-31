// The invoice register — the document an accountant actually works from, and the source the VAT
// return is reconciled against. Every column is on the page already except the credited reference:
// a credit note is only meaningful next to the invoice it reverses, and "credit_of: <uuid>" is not
// something a human can follow, so the originals are resolved to their printed refs.
//
// Same query and same period as app/(app)/invoices/page.tsx, so `Total`/`VAT` sum to the two cards
// on screen. Credit notes carry negative amounts and net out on a plain sum — that is the figure
// the shop owes, reversals included.
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { fmtDubai, parsePeriod } from "@/lib/period";
import { csvMoney, csvResponse, toCsv } from "@/lib/csv";
import { invoiceRef } from "@/lib/types";
import { audit } from "@/lib/audit";

interface Row {
  id: string;
  shop_id: string;
  invoice_number: number;
  day_seq: number | null;
  source: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_trn: string | null;
  subtotal: string;
  discount: string | null;
  vat_amount: string;
  total: string;
  issued_at: string;
  credit_of: string | null;
  reason: string | null;
  created_by: string;
}

export async function GET(req: Request): Promise<Response> {
  const scope = await getScope();
  const ids = scopedShopIds(scope);
  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("date") || url.searchParams.get("period") || "monthly");
  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));

  const { data } = await db
    .from("invoices")
    .select("id,shop_id,invoice_number,day_seq,source,customer_name,customer_phone,customer_trn,subtotal,discount,vat_amount,total,issued_at,credit_of,reason,created_by")
    .in("shop_id", ids)
    .gte("issued_at", period.start.toISOString())
    .lt("issued_at", period.end.toISOString())
    .order("issued_at", { ascending: false })
    .limit(5000);
  const rows = (data ?? []) as unknown as Row[];

  // Resolve what each credit note reverses. The original can predate the period, so it is fetched
  // by id rather than assumed to be in `rows`.
  const creditedIds = [...new Set(rows.map((r) => r.credit_of).filter(Boolean))] as string[];
  const refById = new Map<string, string>();
  if (creditedIds.length > 0) {
    const { data: originals } = await db
      .from("invoices")
      .select("id,invoice_number,day_seq,issued_at")
      .in("id", creditedIds);
    for (const o of (originals ?? []) as Row[]) {
      refById.set(o.id, invoiceRef(o.issued_at, o.day_seq, o.invoice_number));
    }
  }

  const csv = toCsv(
    ["Document", "Issued (Dubai)", "Type", "Channel", "Shop", "Customer", "Phone", "Customer TRN",
     "Subtotal AED", "Discount AED", "VAT AED", "Total AED", "Reverses", "Reason", "Issued by"],
    rows.map((r) => [
      invoiceRef(r.issued_at, r.day_seq, r.invoice_number, !!r.credit_of),
      fmtDubai(r.issued_at),
      r.credit_of ? "Credit note" : "Tax invoice",
      r.source === "counter" ? "Counter sale" : "Online sale",
      shopName.get(r.shop_id) ?? "",
      r.customer_name || "walk-in",
      r.customer_phone ?? "",
      r.customer_trn ?? "",
      csvMoney(r.subtotal),
      csvMoney(r.discount),
      csvMoney(r.vat_amount),
      csvMoney(r.total),
      r.credit_of ? refById.get(r.credit_of) ?? "" : "",
      r.reason ?? "",
      r.created_by,
    ]),
  );

  await audit(`dashboard:${scope.email}`, "dexport", ids.length === 1 ? ids[0] : null, {
    args: [`the invoice register (${period.label})`],
  });
  return csvResponse(`invoices-${period.key}.csv`, csv);
}
