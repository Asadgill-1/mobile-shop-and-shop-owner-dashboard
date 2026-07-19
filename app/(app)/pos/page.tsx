import { Banknote, CreditCard, Store } from "lucide-react";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { aed } from "@/lib/money";
import { dubaiDateISO } from "@/lib/period";
import { productCode, type CounterSaleRow } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { PosTerminal, type PosProduct } from "@/components/pos-terminal";
import { VoidButton } from "@/components/void-button";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const scope = await getScope();
  const shopId = scope.activeShopId ?? (scope.shops.length === 1 ? scope.shops[0].id : null);

  if (!shopId) {
    return (
      <>
        <PageHeader title="POS" sub="Counter sales" />
        <Card>
          <EmptyState
            icon={Store}
            title="Pick a shop first"
            hint="Use the shop switcher in the header to choose which shop is selling."
          />
        </Card>
      </>
    );
  }

  const [{ data: prods }, { data: units }, { data: todayRows }] = await Promise.all([
    db
      .from("products")
      .select("id,product_number,category,brand,model,color,selling_price,quantity,barcode")
      .eq("shop_id", shopId)
      .gt("quantity", 0)
      .order("brand"),
    db
      .from("product_units")
      .select("product_id,imei")
      .eq("shop_id", shopId)
      .eq("status", "in_stock"),
    db
      .from("counter_sales")
      .select("id,quantity,sold_price,sold_by,payment_method,discrepancy,products(brand,model)")
      .eq("shop_id", shopId)
      .eq("sold_on", dubaiDateISO())
      .order("created_at", { ascending: false }),
  ]);

  const imeisByProduct = new Map<string, string[]>();
  for (const u of units ?? []) {
    imeisByProduct.set(u.product_id, [...(imeisByProduct.get(u.product_id) ?? []), u.imei]);
  }
  const products: PosProduct[] = (prods ?? []).map((p) => ({
    id: p.id,
    code: productCode(p.product_number),
    name: `${p.brand} ${p.model}${p.color ? ` ${p.color}` : ""}`,
    category: p.category,
    price: Number(p.selling_price),
    qty: p.quantity,
    barcode: p.barcode,
    stockImeis: imeisByProduct.get(p.id) ?? [],
  }));

  const today = (todayRows ?? []) as unknown as (CounterSaleRow & {
    products: { brand: string; model: string } | null;
  })[];
  // Z-report-lite: net cash / card takings for the Dubai day (void rows are negative)
  let cashTotal = 0;
  let cardTotal = 0;
  for (const r of today) {
    const amt = Number(r.sold_price) * r.quantity;
    if (r.payment_method === "card") cardTotal += amt;
    else cashTotal += amt; // bot photo-flow rows (null method) were cash counter sales by nature
  }
  // Originals whose reversal exists (sold_by carries "void:{originalId}") lose their Void button.
  const voidedIds = new Set(
    today
      .filter((r) => r.sold_by?.startsWith("void:"))
      .map((r) => r.sold_by!.slice(5).split(" ")[0]),
  );

  return (
    <>
      <PageHeader title="POS" sub={scope.shops.find((s) => s.id === shopId)?.name} />

      <Card className="p-4 sm:p-5">
        {products.length === 0 ? (
          <EmptyState icon={Store} title="No products in stock" hint="Add stock in Inventory first." />
        ) : (
          <PosTerminal shopId={shopId} products={products} />
        )}
      </Card>

      <SectionTitle>Today</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Cash" value={aed(cashTotal)} icon={Banknote} tone="accent" />
        <StatCard label="Card" value={aed(cardTotal)} icon={CreditCard} tone="info" />
      </div>
      <Card>
        {today.length === 0 ? (
          <EmptyState icon={Banknote} title="No counter sales today yet" />
        ) : (
          <ul className="divide-y divide-border">
            {today.map((r) => {
              const isVoid = r.quantity < 0;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${isVoid ? "line-through text-subtle" : ""}`}>
                      {r.products ? `${r.products.brand} ${r.products.model}` : "—"} × {Math.abs(r.quantity)}
                    </p>
                    <p className="text-xs text-subtle">
                      {r.payment_method ?? "cash"}
                      {r.sold_by?.startsWith("void:") ? " · reversal" : ""}
                      {r.discrepancy ? " · discrepancy" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {isVoid ? (
                      <Badge tone="destructive">VOID</Badge>
                    ) : voidedIds.has(r.id) ? (
                      <Badge tone="neutral">voided</Badge>
                    ) : (
                      <VoidButton saleId={r.id} />
                    )}
                    <span className={`tabular font-semibold text-sm ${isVoid ? "text-destructive-text" : ""}`}>
                      {aed(Number(r.sold_price) * r.quantity)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
