// The reports page as a spreadsheet. It calls the SAME profitSummary the page calls, so the
// numbers cannot drift from what the owner just read on screen — a report and its export
// disagreeing is worse than no export at all.
//
// One file, four blocks (summary, per shop, per product, per day), because an owner opening this
// wants the whole picture in one place. Anything genuinely separate — the invoice register, the
// stock list — has its own route.
import { getScope, scopedShopIds } from "@/lib/scope";
import { parsePeriod } from "@/lib/period";
import { profitSummary } from "@/lib/profit";
import { csvResponse, toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";

const n2 = (n: number) => n.toFixed(2);

export async function GET(req: Request): Promise<Response> {
  const scope = await getScope();
  const ids = scopedShopIds(scope);
  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("date") || url.searchParams.get("period") || "today");
  const s = await profitSummary(ids, period);
  const shopName = new Map(scope.shops.map((sh) => [sh.id, sh.name]));

  const rows: (string | number)[][] = [
    ["SUMMARY", period.label],
    ["Orders", s.orders],
    ["Revenue AED", n2(s.revenue)],
    ["Cost AED", n2(s.cost)],
    ["Profit AED", n2(s.profit)],
    ["Margin %", n2(s.margin)],
    ["Discounts given AED", n2(s.discounts)],
    ["Sales with a discount", s.discountCount],
    ["VAT collected AED", n2(s.vatCollected)],
    ["Online revenue AED", n2(s.onlineRevenue)],
    ["Online profit AED", n2(s.onlineProfit)],
    ["Counter revenue AED", n2(s.counterRevenue)],
    ["Counter profit AED", n2(s.counterProfit)],
    ["Delivery collected AED", n2(s.deliveryCollected)],
    ["Delivery kept by riders AED", n2(s.deliveryKept)],
    ["Counter taken in cash AED", n2(s.payment.cash)],
    ["Counter taken by card AED", n2(s.payment.card)],
    // A counter row with no tender recorded — bot photo-sheet sales predate the POS and never said.
    ["Counter with no tender recorded AED", n2(s.payment.unspecified)],
    ["Cancelled orders", s.cancels.count],
    ["Cancelled value AED", n2(s.cancels.value)],
    [],
    ["BY SHOP", "Orders", "Revenue AED", "Profit AED", "Margin %"],
    ...s.perShop.map((b) => [
      shopName.get(b.shopId) ?? b.shopId, b.orders, n2(b.revenue), n2(b.profit), n2(b.margin),
    ]),
    [],
    // Whole catalogue, sold-first: the rows at the bottom with qty 0 and stock left ARE the
    // dead-stock list, which is why unsold products are not filtered out.
    ["BY PRODUCT", "Qty sold", "Revenue AED", "Profit AED", "Stock left"],
    ...s.products.map((p) => [p.label, p.qty, n2(p.revenue), n2(p.profit), p.stock]),
    [],
    ["BY DAY (Dubai)", "Revenue AED"],
    ...s.daily.map((d) => [d.day, n2(d.revenue)]),
  ];

  await audit(`dashboard:${scope.email}`, "dexport", ids.length === 1 ? ids[0] : null, {
    args: [`the ${period.label} report`],
  });
  return csvResponse(`report-${period.key}.csv`, toCsv(["Report", "", "", "", ""], rows));
}
