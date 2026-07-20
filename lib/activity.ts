// Shop logs humanizer — port of reports/service.py::_HUMAN_ACTIONS plus the dashboard-only
// codes (which the backend feed shows raw; here they read like everything else).
// {0}/{1} fill from detail.args; an unmapped action falls back to code + text snippet —
// it must never vanish from the log, that's the one worth seeing.
import { aed } from "./money";
import type { AuditRow } from "./types";

const T: Record<string, string> = {
  // orders (bot buttons + slash commands land on the same phrasing)
  kconf: "confirmed order #{0}", confirmorder_cmd: "confirmed order #{0}",
  krej: "rejected order #{0}", rejectorder_cmd: "rejected order #{0}",
  kdup: "moved order #{0} to {1}", deliveryupdate_cmd: "updated a delivery",
  kappr: "approved price request #{0}", approveprice_cmd: "approved a price request",
  kcust: "countered price request #{0}", custom_cmd: "countered a price request",
  kdeny: "denied price request #{0}", denyprice_cmd: "denied a price request",
  kasgr: "assigned order #{0} to a rider", assigndelivery_cmd: "assigned a delivery",
  krec: "reconciled COD with a rider", reconcilecod_cmd: "reconciled COD with a rider",
  kneg: "turned negotiation {0}", negotiation_cmd: "changed negotiation",
  ksheet: "downloaded the counter sheet", countersheet_cmd: "downloaded the counter sheet",
  kboost: "boosted a product", kunboost: "cleared a product's boost",
  ktag: "tagged a product", kuntag: "removed a product tag",
  kcleartags: "cleared a product's tags", kfeature: "toggled a product's featured flag",
  kprodadd: "added product #{0}",
  racc: "confirmed pickup of order #{0}", rnrx: "reported order #{0} NOT received",
  rider_deliver: "delivered an order", rider_cancel: "cancelled a delivery",
  rider_accept: "confirmed a pickup", rider_notreceived: "reported an order not received",
  exportorders_cmd: "exported orders", exportrider_cmd: "exported a rider route",
  counter_sale: "recorded a counter sale",
  // dashboard
  dcsale: "recorded a counter sale of {0} item(s)", dvoid: "voided counter sale {0}",
  dinv: "issued invoice INV-{0}",
  dreply: "replied to customer {0} from the dashboard",
  dhandover: "returned customer {0} to the AI",
  dedit: "edited product #{0}: {1}",
  dash_cancel: "cancelled order #{0}",
  dash_create_draft: "created draft order #{0}",
  dash_rider_add: "added a rider",
  dash_product_new: "added product #{0}",
  dash_product_edit: "edited product #{0}",
  dash_product_delete: "deleted product #{0}",
  dash_stock_adj: "adjusted stock of product #{0} by {1}",
  dash_media: "updated media of product #{0} ({1})",
  dash_invoice_identity: "updated the shop's tax invoice details",
};

export function humanize(row: AuditRow): string {
  const template = T[row.action];
  const args = row.detail?.args ?? [];
  if (!template) {
    const text = row.detail?.text ? ` — ${String(row.detail.text).slice(0, 40)}` : "";
    return `${row.action}${text}`;
  }
  return template.replace(/\{(\d)\}/g, (_, i: string) => String(args[Number(i)] ?? "?"));
}

const FIELD_LABELS: Record<string, string> = {
  selling_price: "Price",
  cost_price: "Cost",
  brand: "Brand",
  model: "Model",
  color: "Color",
  category: "Category",
  condition: "Condition",
  min_qty: "Low-stock alert",
  barcode: "Barcode",
};
const MONEY_FIELDS = new Set(["selling_price", "cost_price"]);

/** dedit diffs → "Price: AED 1,200 → AED 1,100" lines for the log row. */
export function changeLines(row: AuditRow): string[] {
  const changes = row.detail?.changes;
  if (!changes) return [];
  return Object.entries(changes).map(([field, [oldV, newV]]) => {
    const fmt = (v: string) =>
      v !== "—" && MONEY_FIELDS.has(field) && !Number.isNaN(Number(v)) ? aed(Number(v)) : v;
    return `${FIELD_LABELS[field] ?? field}: ${fmt(oldV)} → ${fmt(newV)}`;
  });
}

export type ActivityCategory = "orders" | "products" | "pos" | "chats" | "other";

const CATEGORY_OF: Record<string, ActivityCategory> = {};
for (const a of [
  "kconf", "confirmorder_cmd", "krej", "rejectorder_cmd", "kdup", "deliveryupdate_cmd",
  "kappr", "approveprice_cmd", "kcust", "custom_cmd", "kdeny", "denyprice_cmd",
  "kasgr", "assigndelivery_cmd", "racc", "rnrx", "rider_deliver", "rider_cancel",
  "rider_accept", "rider_notreceived", "dash_cancel", "dash_create_draft",
  "exportorders_cmd", "exportrider_cmd",
]) CATEGORY_OF[a] = "orders";
for (const a of [
  "kboost", "kunboost", "ktag", "kuntag", "kcleartags", "kfeature", "kprodadd", "dedit",
  "dash_product_new", "dash_product_edit", "dash_product_delete", "dash_stock_adj", "dash_media",
]) CATEGORY_OF[a] = "products";
for (const a of ["dcsale", "dvoid", "dinv", "counter_sale", "ksheet", "countersheet_cmd"])
  CATEGORY_OF[a] = "pos";
for (const a of ["dreply", "dhandover"]) CATEGORY_OF[a] = "chats";

export function categoryOf(action: string): ActivityCategory {
  return CATEGORY_OF[action] ?? "other";
}

/** "dashboard:x@y" → "x@y"; telegram id → keeper/rider name (or "ID 123"); "system" → "System". */
export function actorName(actor: string, names: Record<string, string>): string {
  if (actor.startsWith("dashboard:")) return actor.slice("dashboard:".length);
  if (actor === "system") return "System";
  return names[actor] ?? `ID ${actor}`;
}
