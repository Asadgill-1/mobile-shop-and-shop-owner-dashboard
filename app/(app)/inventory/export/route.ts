// Stock list with what it is worth. The inventory page shows counts; an owner doing a stock-take,
// an insurance schedule or a year-end needs the money beside them, so this adds `Stock value at
// cost` (quantity × cost_price) and the totals row underneath.
//
// `Units with IMEI` is the theft signal, not a formatting detail: when a serialized product's
// in-stock unit count and its quantity disagree, one of the two is wrong and nobody is told today
// (022 left products.quantity as the source of truth and the unit ledger opt-in). Putting both in
// one column pair makes the drift visible on the sheet the shop already reads.
//
// ponytail: values at TODAY's cost_price, like every other cost figure here. Valuation at a past
// date needs a cost on the stock movement — Phase 6, with the costing method.
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { csvMoney, csvResponse, toCsv } from "@/lib/csv";
import { productCode } from "@/lib/types";
import { audit } from "@/lib/audit";

interface Row {
  id: string;
  shop_id: string;
  product_number: number | null;
  category: string;
  brand: string;
  model: string;
  color: string | null;
  condition: string;
  barcode: string | null;
  quantity: number;
  min_qty: number | null;
  cost_price: string;
  selling_price: string;
  min_price: string | null;
}

export async function GET(): Promise<Response> {
  const scope = await getScope();
  const ids = scopedShopIds(scope);
  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));

  const [{ data }, { data: units }] = await Promise.all([
    db
      .from("products")
      .select("id,shop_id,product_number,category,brand,model,color,condition,barcode,quantity,min_qty,cost_price,selling_price,min_price")
      .in("shop_id", ids)
      .order("product_number", { ascending: true })
      .limit(5000),
    db.from("product_units").select("product_id").in("shop_id", ids).eq("status", "in_stock"),
  ]);
  const rows = (data ?? []) as unknown as Row[];

  const inStock = new Map<string, number>();
  for (const u of (units ?? []) as { product_id: string }[]) {
    inStock.set(u.product_id, (inStock.get(u.product_id) ?? 0) + 1);
  }

  let totalUnits = 0;
  let totalCost = 0;
  let totalRetail = 0;
  const body = rows.map((p) => {
    const cost = Number(p.cost_price) * p.quantity;
    const retail = Number(p.selling_price) * p.quantity;
    totalUnits += p.quantity;
    totalCost += cost;
    totalRetail += retail;
    const imeis = inStock.get(p.id) ?? 0;
    return [
      productCode(p.product_number),
      shopName.get(p.shop_id) ?? "",
      p.category,
      p.brand,
      p.model,
      p.color ?? "",
      p.condition,
      p.barcode ?? "",
      p.quantity,
      imeis,
      // Only meaningful where the shop actually serializes the product; blank beats a false alarm.
      imeis === 0 && p.quantity > 0 ? "" : imeis === p.quantity ? "" : "MISMATCH",
      csvMoney(p.cost_price),
      csvMoney(p.selling_price),
      p.min_price == null ? "" : csvMoney(p.min_price),
      csvMoney(cost),
      csvMoney(retail),
      p.min_qty && p.min_qty > 0 && p.quantity <= p.min_qty ? "LOW" : "",
    ];
  });

  const csv = toCsv(
    ["Code", "Shop", "Category", "Brand", "Model", "Color", "Condition", "Barcode",
     "Qty", "Units with IMEI", "IMEI check", "Cost AED", "Sell AED", "Floor AED",
     "Stock value at cost AED", "Stock value at retail AED", "Low stock"],
    [
      ...body,
      [],
      ["TOTAL", "", "", "", "", "", "", "", totalUnits, "", "", "", "", "",
       csvMoney(totalCost), csvMoney(totalRetail), ""],
    ],
  );

  await audit(`dashboard:${scope.email}`, "dexport", ids.length === 1 ? ids[0] : null, {
    args: ["the stock list with valuations"],
  });
  return csvResponse("inventory.csv", csv);
}
