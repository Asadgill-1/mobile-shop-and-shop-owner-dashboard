// Purchase register CSV — the input half of a VAT return, in the shape an accountant totals.
// Same query and same order as the page: a report and its export must not drift.
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { dubaiDateISO, parsePeriod } from "@/lib/period";
import { csvMoney, csvResponse, toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";

export async function GET(req: Request): Promise<Response> {
  const scope = await getScope();
  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("date") || url.searchParams.get("period") || "monthly");
  const ids = scopedShopIds(scope);
  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));

  const { data } = await db
    .from("purchase_invoices")
    .select(
      "shop_id,supplier_invoice_no,supplier_trn,invoice_date,subtotal,vat_amount,vat_treatment,recoverable,notes,created_by, suppliers(name)",
    )
    .in("shop_id", ids)
    .gte("invoice_date", dubaiDateISO(period.start))
    .lt("invoice_date", dubaiDateISO(period.end))
    .order("invoice_date", { ascending: false });

  interface Row {
    shop_id: string;
    supplier_invoice_no: string;
    supplier_trn: string | null;
    invoice_date: string;
    subtotal: string;
    vat_amount: string;
    vat_treatment: string;
    recoverable: boolean;
    notes: string | null;
    created_by: string;
    suppliers: { name: string } | null;
  }

  const csv = toCsv(
    [
      "Bill date", "Shop", "Supplier", "Supplier TRN", "Their invoice no",
      "Net AED", "VAT AED", "Total AED", "Treatment", "Claimable", "Note", "Booked by",
    ],
    ((data ?? []) as unknown as Row[]).map((r) => [
      r.invoice_date,
      shopName.get(r.shop_id) ?? "",
      r.suppliers?.name ?? "",
      // Leading apostrophe would be Excel-specific; the raw 15 digits stay a number-looking string,
      // which is what an accountant pastes into the FTA portal.
      r.supplier_trn ?? "",
      r.supplier_invoice_no,
      csvMoney(r.subtotal),
      csvMoney(r.vat_amount),
      csvMoney(Number(r.subtotal) + Number(r.vat_amount)),
      r.vat_treatment,
      r.recoverable ? "yes" : "no",
      r.notes ?? "",
      r.created_by,
    ]),
  );

  await audit(`dashboard:${scope.email}`, "dexport", ids.length === 1 ? ids[0] : null, {
    args: [`the purchase register (${period.label})`],
  });
  return csvResponse(`purchases-${period.key}.csv`, csv);
}
