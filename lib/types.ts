// Row shapes for the columns this dashboard actually selects.
// Hand-written against migrations 001–010 of the Python backend (verified, not generated).

export type OrderStatus =
  | "draft" | "pending" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled";

export interface OrderRow {
  id: string;
  shop_id: string;
  order_number: number;
  customer_name: string;
  phone: string;
  address: string;
  product_id: string;
  quantity: number;
  day_seq: number | null;
  /** TOTAL gross (unit × qty) — net charge = selling_price − discount_amount. */
  selling_price: string;
  discount_amount: string;
  /** Home-delivery charge (023); customer paid selling_price − discount + delivery_fee. */
  delivery_fee: string | null;
  delivery_date: string | null;
  rider_id: string | null;
  special_instructions: string | null;
  status: OrderStatus;
  created_at: string;
  cod_amount: string | null;
  cash_received: string | null;
  delivered_at: string | null;
  custody: "none" | "offered" | "accepted" | "disputed";
  custody_at: string | null;
  cancel_remarks: string | null;
  products?: ProductJoin | null;
}

export interface ProductJoin {
  brand: string;
  model: string;
  color?: string | null;
  cost_price?: string;
  tags?: string[];
}

export interface ProductRow {
  id: string;
  shop_id: string;
  product_number: number | null;
  category: "Mobile" | "Laptop" | "Tablet" | "Accessory";
  brand: string;
  model: string;
  color: string | null;
  condition: "New" | "Used" | "Refurbished";
  specs: Record<string, string>;
  cost_price: string;
  selling_price: string;
  quantity: number;
  min_qty: number;
  images: string[];
  video_url: string | null;
  boost_level: number;
  tags: string[];
  is_featured: boolean;
  barcode: string | null;
  created_at: string;
}

export interface RiderRow {
  id: string;
  shop_id: string;
  rider_number: number | null;
  name: string;
  phone: string;
  telegram_id: number | null;
  created_at: string;
}

export interface CodLedgerRow {
  id: string;
  shop_id: string;
  rider_id: string;
  order_id: string | null;
  entry: "collect" | "handover";
  amount: string;
  note: string | null;
  created_at: string;
}

export interface MessageRow {
  shop_id: string;
  identity: string;
  role: "customer" | "assistant" | "shopkeeper";
  content: string;
  created_at: string;
}

export interface EscalationRow {
  id: string;
  shop_id: string;
  phone: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
}

export interface PriceRequestRow {
  request_number: number;
  shop_id: string;
  phone: string;
  requested_price: string;
  status: "pending" | "approved" | "denied";
  created_at: string;
  products?: { brand: string; model: string; selling_price: string } | null;
}

export interface CounterSaleRow {
  id: string;
  shop_id: string;
  product_id: string;
  /** Negative = void reversal row (migration 022); sums net out. */
  quantity: number;
  /** PER-UNIT price (unlike orders.selling_price which is the total). */
  sold_price: string;
  sold_on: string;
  discrepancy: boolean;
  sold_by: string | null;
  payment_method: "cash" | "card" | null;
  products?: ProductJoin | null;
}

export interface ProductUnitRow {
  id: string;
  shop_id: string;
  product_id: string;
  imei: string;
  status: "in_stock" | "sold";
  counter_sale_id: string | null;
  order_id: string | null;
  added_at: string;
  sold_at: string | null;
}

export interface InvoiceItem {
  desc: string;
  qty: number;
  unit_price: number;
  line_total: number;
  imeis?: string[];
}

export interface InvoiceRow {
  id: string;
  shop_id: string;
  invoice_number: number;
  day_seq: number | null;
  source: "order" | "counter";
  order_id: string | null;
  counter_sale_ids: string[] | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_trn: string | null;
  items: InvoiceItem[];
  subtotal: string;
  vat_rate: string;
  vat_amount: string;
  total: string;
  issued_at: string;
  created_by: string;
}

export interface StatusHistoryRow {
  status: string;
  changed_at: string;
  changed_by: string | null;
}

export type OfferType =
  | "free_gift"
  | "percent_off"
  | "amount_off"
  | "free_delivery"
  | "bogo"
  | "bulk";

/** audit_logs (migration 001) — the transparency feed behind Shop logs. */
export interface AuditRow {
  id: string;
  shop_id: string | null;
  actor: string; // telegram id, "dashboard:{email}", or "system"
  action: string;
  detail: {
    args?: (string | number)[];
    text?: string;
    changes?: Record<string, [string, string]>; // dedit field diffs: {field: [old, new]}
  };
  created_at: string;
}

/** "PR0001" from products.product_number (utils/codes.py port). */
export function productCode(n: number | null | undefined): string {
  return n ? `PR${String(n).padStart(4, "0")}` : "—";
}

/** "rider001" from delivery_persons.rider_number. */
export function riderCode(n: number | null | undefined): string {
  return n ? `rider${String(n).padStart(3, "0")}` : "—";
}

/** "INV-000042" from invoices.invoice_number (per-shop sequence, migration 022). */
export function invoiceCode(n: number | null | undefined): string {
  return n ? `INV-${String(n).padStart(6, "0")}` : "—";
}

/** Dubai wall-clock D/M from a UTC ISO string: shift +4h, read UTC parts (mirrors backend codes.py). */
function dubaiDM(iso: string): { dd: string; mm: string } {
  const d = new Date(new Date(iso).getTime() + 4 * 3600 * 1000);
  return {
    dd: String(d.getUTCDate()).padStart(2, "0"),
    mm: String(d.getUTCMonth() + 1).padStart(2, "0"),
  };
}

/** "ODR-20-07-001" from (created_at, orders.day_seq) — migration 023 date-based display ref.
 *  Pre-023 orders have no day_seq → fall back to "#{order_number}" (or "—"). */
export function orderRef(
  createdAt: string | null,
  daySeq: number | null | undefined,
  fallbackNumber?: number | null,
): string {
  if (createdAt && daySeq) {
    const { dd, mm } = dubaiDM(createdAt);
    return `ODR-${dd}-${mm}-${String(daySeq).padStart(3, "0")}`;
  }
  return fallbackNumber ? `#${fallbackNumber}` : "—";
}

/** "INV-20-07-001" from (issued_at, invoices.day_seq) — migration 023 date-based display ref. */
export function invoiceRef(
  issuedAt: string | null,
  daySeq: number | null | undefined,
  fallbackNumber?: number | null,
): string {
  if (issuedAt && daySeq) {
    const { dd, mm } = dubaiDM(issuedAt);
    return `INV-${dd}-${mm}-${String(daySeq).padStart(3, "0")}`;
  }
  return invoiceCode(fallbackNumber); // pre-023 invoices keep their INV-000042 code
}

/** Low-stock rule, mirroring the bot: explicit threshold wins; else the ≤2 heuristic. */
export function isLowStock(p: { quantity: number; min_qty?: number | null }): boolean {
  const min = p.min_qty ?? 0;
  return min > 0 ? p.quantity <= min : p.quantity <= 2;
}
