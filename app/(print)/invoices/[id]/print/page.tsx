import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { invoiceCode, type InvoiceRow } from "@/lib/types";

// FTA tax invoice, bilingual (Consumer Protection Law: Arabic mandatory, English optional).
// Two paper formats: 80mm thermal slip (POS default) and A4. Browser print → paper or PDF.

export const dynamic = "force-dynamic";

const fils = (v: number | string) =>
  Number(v).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function dubaiStamp(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const [{ id }, { format }, scope] = await Promise.all([params, searchParams, getScope()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await db
    .from("invoices")
    .select("*")
    .eq("id", id)
    .in("shop_id", scope.shopIds)
    .maybeSingle();
  if (!data) notFound();
  const inv = data as InvoiceRow;

  const { data: shop } = await db
    .from("shops")
    .select("name,trn,invoice_name,invoice_address")
    .eq("id", inv.shop_id)
    .single();
  const legalName = shop?.invoice_name || shop?.name || "";
  const slip = (format ?? (inv.source === "counter" ? "receipt" : "a4")) !== "a4";
  const code = invoiceCode(inv.invoice_number);

  const css = slip
    ? `
      @page { size: 80mm auto; margin: 4mm; }
      body { font: 12px/1.45 -apple-system, "Segoe UI", Arial, sans-serif; color: #000; margin: 0; }
      .sheet { width: 72mm; margin: 0 auto; padding: 8px 0; }
      .center { text-align: center; }
      h1 { font-size: 14px; margin: 0; }
      .ar { direction: rtl; }
      .muted { font-size: 11px; }
      hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      td { padding: 2px 0; vertical-align: top; }
      .r { text-align: right; }
      .tot td { font-weight: 700; font-size: 13px; }
      .imei { font-size: 10px; }
      .noprint { text-align: center; margin: 12px 0; }
      @media print { .noprint { display: none; } }`
    : `
      @page { size: A4; margin: 18mm; }
      body { font: 14px/1.55 -apple-system, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; }
      .sheet { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
      .head { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
      h1 { font-size: 22px; margin: 0 0 2px; }
      .ar { direction: rtl; }
      .muted { color: #555; font-size: 13px; }
      .meta { text-align: right; }
      .block { margin-top: 18px; }
      table.items { width: 100%; border-collapse: collapse; margin-top: 18px; }
      table.items th { text-align: left; border-bottom: 2px solid #111; padding: 6px 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
      table.items td { border-bottom: 1px solid #ddd; padding: 8px; vertical-align: top; }
      .r { text-align: right; }
      .totals { margin-left: auto; margin-top: 14px; width: 280px; }
      .totals td { padding: 4px 8px; }
      .totals .g td { font-weight: 700; font-size: 16px; border-top: 2px solid #111; }
      .imei { color: #555; font-size: 12px; }
      .foot { margin-top: 32px; text-align: center; color: #555; font-size: 13px; }
      .noprint { text-align: center; margin: 16px 0; }
      @media print { .noprint { display: none; } }`;

  const printBtn = (
    <div className="noprint">
      <button
        // eslint-disable-next-line react/no-unknown-property
        style={{ font: "inherit", padding: "10px 24px", cursor: "pointer" }}
        type="button"
        id="print-btn"
      >
        🖨️ Print / طباعة
      </button>
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {!shop?.trn && (
        <div className="noprint" style={{ background: "#fef3c7", color: "#92400e", padding: "10px 16px", fontSize: 13 }}>
          ⚠️ No TRN set for this shop — a VAT invoice must carry it. Add it in Settings.
        </div>
      )}
      <div className="sheet">
        {slip ? (
          <>
            <div className="center">
              <h1>{legalName}</h1>
              {shop?.invoice_address && <div className="muted">{shop.invoice_address}</div>}
              {shop?.trn && (
                <div className="muted">
                  TRN <span className="ar">رقم التسجيل الضريبي</span>: {shop.trn}
                </div>
              )}
            </div>
            <hr />
            <div className="center">
              <strong>
                TAX INVOICE <span className="ar">فاتورة ضريبية</span>
              </strong>
              <div className="muted">
                {code} · {dubaiStamp(inv.issued_at)}
              </div>
              {inv.customer_name && <div className="muted">Customer / العميل: {inv.customer_name}</div>}
              {inv.customer_trn && <div className="muted">Customer TRN: {inv.customer_trn}</div>}
            </div>
            <hr />
            <table>
              <tbody>
                {inv.items.map((item, i) => (
                  <tr key={i}>
                    <td>
                      {item.desc}
                      <br />
                      <span className="muted">
                        {item.qty} × {fils(item.unit_price)}
                      </span>
                      {item.imeis?.length ? (
                        <>
                          <br />
                          <span className="imei">IMEI: {item.imeis.join(", ")}</span>
                        </>
                      ) : null}
                    </td>
                    <td className="r">{fils(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <hr />
            <table>
              <tbody>
                <tr>
                  <td>
                    Subtotal <span className="ar">قبل الضريبة</span>
                  </td>
                  <td className="r">{fils(inv.subtotal)}</td>
                </tr>
                <tr>
                  <td>
                    VAT {Number(inv.vat_rate)}% <span className="ar">ضريبة القيمة المضافة</span>
                  </td>
                  <td className="r">{fils(inv.vat_amount)}</td>
                </tr>
                <tr className="tot">
                  <td>
                    TOTAL AED <span className="ar">الإجمالي</span>
                  </td>
                  <td className="r">{fils(inv.total)}</td>
                </tr>
              </tbody>
            </table>
            <hr />
            <div className="center muted">
              Prices include 5% VAT · الأسعار شاملة ضريبة القيمة المضافة
              <br />
              Thank you for your visit · شكراً لزيارتكم
            </div>
          </>
        ) : (
          <>
            <div className="head">
              <div>
                <h1>{legalName}</h1>
                {shop?.invoice_address && <div className="muted">{shop.invoice_address}</div>}
                {shop?.trn && (
                  <div className="muted">
                    TRN <span className="ar">رقم التسجيل الضريبي</span>: {shop.trn}
                  </div>
                )}
              </div>
              <div className="meta">
                <h1>
                  TAX INVOICE
                  <br />
                  <span className="ar">فاتورة ضريبية</span>
                </h1>
                <div className="muted">
                  {code}
                  <br />
                  Date / التاريخ: {dubaiStamp(inv.issued_at)}
                </div>
              </div>
            </div>

            {(inv.customer_name || inv.customer_trn) && (
              <div className="block">
                <strong>Bill to / العميل</strong>
                <div className="muted">
                  {inv.customer_name}
                  {inv.customer_phone ? ` · ${inv.customer_phone}` : ""}
                  {inv.customer_address ? (
                    <>
                      <br />
                      {inv.customer_address}
                    </>
                  ) : null}
                  {inv.customer_trn ? (
                    <>
                      <br />
                      TRN: {inv.customer_trn}
                    </>
                  ) : null}
                </div>
              </div>
            )}

            <table className="items">
              <thead>
                <tr>
                  <th>Description / الوصف</th>
                  <th className="r">Qty / الكمية</th>
                  <th className="r">Unit / سعر الوحدة</th>
                  <th className="r">Total / الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((item, i) => (
                  <tr key={i}>
                    <td>
                      {item.desc}
                      {item.imeis?.length ? (
                        <>
                          <br />
                          <span className="imei">IMEI: {item.imeis.join(", ")}</span>
                        </>
                      ) : null}
                    </td>
                    <td className="r">{item.qty}</td>
                    <td className="r">{fils(item.unit_price)}</td>
                    <td className="r">{fils(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="totals">
              <tbody>
                <tr>
                  <td>Subtotal (excl. VAT) / قبل الضريبة</td>
                  <td className="r">{fils(inv.subtotal)}</td>
                </tr>
                <tr>
                  <td>VAT 5% / ضريبة القيمة المضافة</td>
                  <td className="r">{fils(inv.vat_amount)}</td>
                </tr>
                <tr className="g">
                  <td>Total AED / الإجمالي الكلي</td>
                  <td className="r">{fils(inv.total)}</td>
                </tr>
              </tbody>
            </table>

            <div className="foot">
              Prices include 5% VAT · الأسعار شاملة ضريبة القيمة المضافة
              <br />
              Thank you for your business · شكراً لتعاملكم معنا
            </div>
          </>
        )}
        {printBtn}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById("print-btn").onclick=function(){window.print()};setTimeout(function(){window.print()},350);`,
        }}
      />
    </>
  );
}
