import Link from "next/link";
import { FileDown, Percent, ReceiptText, ShoppingBag, Store } from "lucide-react";
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { dubaiDateISO, parsePeriod } from "@/lib/period";
import { aed2 } from "@/lib/money";
import { treatmentLabel } from "@/lib/vat";
import { Badge, Card, CsvLink, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { PurchaseForm, SupplierForm, type SupplierOption } from "@/components/purchase-forms";

export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "weekly", label: "7 days" },
  { key: "monthly", label: "This month" },
] as const;

interface PurchaseRow {
  id: string;
  shop_id: string;
  supplier_invoice_no: string;
  supplier_trn: string | null;
  invoice_date: string;
  subtotal: string;
  vat_amount: string;
  vat_treatment: string;
  recoverable: boolean;
  scan_path: string | null;
  notes: string | null;
  suppliers: { name: string } | null;
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>;
}) {
  const [{ period: periodParam, date }, scope] = await Promise.all([searchParams, getScope()]);
  const ids = scopedShopIds(scope);
  const period = parsePeriod(date || periodParam || "monthly");
  // Booking needs one shop; the register below still shows everything in scope.
  const bookShopId = scope.activeShopId ?? (scope.shops.length === 1 ? scope.shops[0].id : null);

  const [{ data: rows }, { data: supplierRows }] = await Promise.all([
    db
      .from("purchase_invoices")
      .select(
        "id,shop_id,supplier_invoice_no,supplier_trn,invoice_date,subtotal,vat_amount,vat_treatment,recoverable,scan_path,notes, suppliers(name)",
      )
      .in("shop_id", ids)
      // invoice_date is a DATE — the day printed on the bill, which is what decides the tax period.
      // Compared against the period's Dubai calendar days, not its UTC instants.
      .gte("invoice_date", dubaiDateISO(period.start))
      .lt("invoice_date", dubaiDateISO(period.end))
      .order("invoice_date", { ascending: false }),
    bookShopId
      ? db.from("suppliers").select("id,name,trn").eq("shop_id", bookShopId).order("name")
      : Promise.resolve({ data: [] as SupplierOption[] }),
  ]);

  const purchases = (rows ?? []) as unknown as PurchaseRow[];
  const suppliers = (supplierRows ?? []) as SupplierOption[];
  const net = purchases.reduce((s, r) => s + Number(r.subtotal), 0);
  const inputVat = purchases.reduce((s, r) => s + Number(r.vat_amount), 0);
  // What actually reaches the return: VAT the shop has said it may claim. The rest is a cost.
  const claimable = purchases
    .filter((r) => r.recoverable)
    .reduce((s, r) => s + Number(r.vat_amount), 0);

  // One call, not one per row: signed links for the bills that have a photo.
  const scanPaths = purchases.map((r) => r.scan_path).filter((p): p is string => !!p);
  const scanUrl = new Map<string, string>();
  if (scanPaths.length > 0) {
    const { data: signed } = await db.storage.from("shop-media").createSignedUrls(scanPaths, 600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) scanUrl.set(s.path, s.signedUrl);
  }
  const shopName = (id: string) => scope.shops.find((s) => s.id === id)?.name;
  const todayDubai = dubaiDateISO(new Date());

  return (
    <>
      <PageHeader
        title="Purchases"
        sub={`${period.label}${scope.activeShopId ? "" : " · all shops"}`}
      >
        <CsvLink
          href={`/purchases/export?period=${encodeURIComponent(period.key)}`}
          label={`Export the purchase register for ${period.label} as CSV`}
        />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/purchases?period=${p.key}`}
            aria-current={period.key === p.key ? "page" : undefined}
            className={`pressable inline-flex items-center rounded-xl px-4 py-2.5 min-h-11 text-sm font-semibold ${
              period.key === p.key
                ? "bg-primary text-primary-fg"
                : "bg-surface border border-border text-subtle"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <form action="/purchases" method="get" className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={/^\d{4}-\d{2}-\d{2}$/.test(period.key) ? period.key : ""}
            aria-label="Custom date"
            className="rounded-xl border border-border bg-surface px-3 py-2.5 min-h-11 text-sm"
          />
          <button
            type="submit"
            className="pressable cursor-pointer rounded-xl bg-surface border border-border text-sm font-semibold px-4 min-h-11"
          >
            Go
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Bought (ex-VAT)" value={aed2(net)} icon={ShoppingBag} tone="neutral" />
        <StatCard label="Input VAT" value={aed2(inputVat)} icon={ReceiptText} tone="info" />
        <StatCard
          label="Claimable"
          value={aed2(claimable)}
          icon={Percent}
          tone="accent"
          hint={claimable === inputVat ? undefined : "Some bills are marked not claimable"}
        />
      </div>

      {bookShopId ? (
        <Card className="p-4 flex flex-col gap-3">
          <SectionTitle>Book a supplier bill</SectionTitle>
          <PurchaseForm shopId={bookShopId} suppliers={suppliers} today={todayDubai} />
          <details className="rounded-xl bg-muted px-3 py-2.5">
            <summary className="cursor-pointer list-none text-sm font-semibold">
              Add a supplier
            </summary>
            <div className="pt-3">
              <SupplierForm shopId={bookShopId} />
            </div>
          </details>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={Store}
            title="Pick a shop to book a bill"
            hint="Use the shop switcher in the header. The register below covers every shop."
          />
        </Card>
      )}

      <SectionTitle>Purchase register</SectionTitle>
      <Card>
        {purchases.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No bills booked in this period"
            hint="Every supplier bill booked here is input VAT the shop can set against what it collected."
          />
        ) : (
          <ul className="divide-y divide-border">
            {purchases.map((r) => (
              <li key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {r.suppliers?.name ?? "supplier"}
                    <span className="font-normal text-subtle"> · {r.supplier_invoice_no}</span>
                  </p>
                  <p className="text-xs text-subtle">
                    {r.invoice_date}
                    {scope.activeShopId ? "" : ` · ${shopName(r.shop_id) ?? ""}`}
                    {r.supplier_trn ? ` · TRN ${r.supplier_trn}` : " · no supplier TRN"}
                  </p>
                  {r.notes ? <p className="text-xs text-subtle mt-0.5">{r.notes}</p> : null}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {r.vat_treatment === "standard" ? null : (
                      <Badge tone="info">{treatmentLabel(r.vat_treatment)}</Badge>
                    )}
                    {r.recoverable ? null : <Badge tone="warning">not claimable</Badge>}
                    {r.scan_path && scanUrl.has(r.scan_path) ? (
                      <a
                        href={scanUrl.get(r.scan_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pressable inline-flex items-center gap-1 rounded-full bg-muted text-subtle px-2.5 py-0.5 text-xs font-semibold"
                      >
                        <FileDown className="size-3.5" strokeWidth={2} aria-hidden />
                        Bill
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="tabular font-semibold text-sm">{aed2(r.subtotal)}</p>
                  <p className="tabular text-xs text-subtle">VAT {aed2(r.vat_amount)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
