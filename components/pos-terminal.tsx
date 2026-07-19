"use client";

// POS terminal: search/scan → cart → checkout. IMEI is compulsory per unit for Mobile/Tablet
// (pick from stocked units or type — late capture records the unit as sold). Camera scanning
// uses the native BarcodeDetector where the browser has it; the button hides elsewhere.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { checkoutSale, type CheckoutResult } from "@/actions/pos";
import { aed } from "@/lib/money";

export interface PosProduct {
  id: string;
  code: string; // PR0005
  name: string; // Apple iPhone 16 Green
  category: string;
  price: number; // selling_price
  qty: number;
  barcode: string | null;
  stockImeis: string[]; // in-stock units of this product
}

interface CartLine {
  product: PosProduct;
  quantity: number;
  unitPrice: string; // input state; parsed at checkout
  imeis: string[];
}

const FULL_INVOICE_THRESHOLD = 10_000;
const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle";

function needsImei(category: string): boolean {
  return category === "Mobile" || category === "Tablet";
}

/* ---------------- barcode scanner (native BarcodeDetector, progressive) ---------------- */

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
    };
  }
}

function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const Detector = window.BarcodeDetector;
    if (!Detector) {
      setError("Scanning is not supported in this browser.");
      return;
    }
    const detector = new Detector({
      formats: ["ean_13", "ean_8", "upc_a", "code_128", "code_39", "itf", "qr_code"],
    });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              onCode(codes[0].rawValue.trim());
              return; // parent closes
            }
          } catch {
            // a frame that fails to decode is not an error
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError("Camera unavailable — allow camera access to scan.");
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl p-4 w-full max-w-md flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-display font-semibold">Scan barcode / IMEI</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="pressable cursor-pointer p-2 rounded-lg border border-border"
          >
            <X className="size-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
        {error ? (
          <p className="text-sm text-destructive-text py-6 text-center">{error}</p>
        ) : (
          <video ref={videoRef} className="w-full rounded-xl bg-black aspect-[4/3]" muted playsInline />
        )}
      </div>
    </div>
  );
}

/* ---------------- IMEI chips per cart line ---------------- */

function ImeiEditor({
  line,
  taken,
  onChange,
}: {
  line: CartLine;
  taken: Set<string>; // IMEIs already used on other lines
  onChange: (imeis: string[]) => void;
}) {
  const [text, setText] = useState("");
  const required = needsImei(line.product.category);
  const suggestions = line.product.stockImeis.filter(
    (i) => !line.imeis.includes(i) && !taken.has(i) && (!text || i.includes(text)),
  );

  const add = (imei: string) => {
    const v = imei.trim();
    if (!v || line.imeis.includes(v)) return;
    onChange([...line.imeis, v]);
    setText("");
  };

  if (!required && line.imeis.length === 0 && line.product.stockImeis.length === 0) return null;

  const missing = required ? line.quantity - line.imeis.length : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {line.imeis.map((imei) => (
          <span
            key={imei}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs tabular"
          >
            {imei}
            <button
              type="button"
              aria-label={`Remove ${imei}`}
              onClick={() => onChange(line.imeis.filter((i) => i !== imei))}
              className="cursor-pointer text-subtle hover:text-foreground"
            >
              <X className="size-3" strokeWidth={2} aria-hidden />
            </button>
          </span>
        ))}
        {missing > 0 && (
          <span className="inline-flex items-center rounded-full bg-warning-soft text-warning-text px-2.5 py-1 text-xs font-semibold">
            {missing} IMEI missing
          </span>
        )}
      </div>
      {line.imeis.length < line.quantity && (
        <div className="relative">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (text.trim()) add(text);
              }
            }}
            placeholder={required ? "Type or pick IMEI…" : "IMEI / serial (optional)"}
            className={`${inputCls} w-full py-1.5 min-h-9 text-sm`}
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {suggestions.slice(0, 6).map((imei) => (
                <button
                  key={imei}
                  type="button"
                  onClick={() => add(imei)}
                  className="pressable cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs tabular hover:bg-muted"
                >
                  + {imei}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- the terminal ---------------- */

export function PosTerminal({ shopId, products }: { shopId: string; products: PosProduct[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<"cash" | "card">("cash");
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", trn: "" });
  const [showCustomer, setShowCustomer] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);

  useEffect(() => setCanScan(!!window.BarcodeDetector), []);

  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = tokens.length
    ? products.filter((p) => {
        const hay = `${p.code} ${p.name} ${p.barcode ?? ""}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
    : [];

  const inCart = (id: string) => cart.reduce((s, l) => (l.product.id === id ? s + l.quantity : s), 0);

  const addProduct = (p: PosProduct, imei?: string) => {
    setResult(null);
    setCart((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i === -1) {
        return [...prev, { product: p, quantity: 1, unitPrice: String(p.price), imeis: imei ? [imei] : [] }];
      }
      const next = [...prev];
      const line = next[i];
      if (line.quantity >= p.qty) return prev; // can't sell more than stock
      next[i] = {
        ...line,
        quantity: line.quantity + 1,
        imeis: imei && !line.imeis.includes(imei) ? [...line.imeis, imei] : line.imeis,
      };
      return next;
    });
    setQuery("");
  };

  const onScan = (code: string) => {
    setScanning(false);
    const byBarcode = products.find((p) => p.barcode && p.barcode === code);
    if (byBarcode) return addProduct(byBarcode);
    const byImei = products.find((p) => p.stockImeis.includes(code));
    if (byImei) return addProduct(byImei, code);
    setQuery(code); // let the person see what was scanned and search manually
  };

  const patchLine = (idx: number, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const total = cart.reduce((s, l) => s + (Number(l.unitPrice) || 0) * l.quantity, 0);
  const needsCustomer = total > FULL_INVOICE_THRESHOLD;

  const checkout = async () => {
    setPending(true);
    setResult(null);
    const res = await checkoutSale({
      shop_id: shopId,
      payment_method: payment,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_address: customer.address,
      customer_trn: customer.trn,
      lines: cart.map((l) => ({
        product_id: l.product.id,
        quantity: l.quantity,
        unit_price: Number(l.unitPrice) || 0,
        imeis: l.imeis,
      })),
    });
    setPending(false);
    setResult(res);
    if (res.ok) {
      setCart([]);
      setCustomer({ name: "", phone: "", address: "", trn: "" });
      setShowCustomer(false);
      router.refresh(); // Today list below is server-rendered
    }
  };

  const usedImeis = (except: number) =>
    new Set(cart.flatMap((l, i) => (i === except ? [] : l.imeis)));

  return (
    <div className="flex flex-col gap-4">
      {scanning && <Scanner onCode={onScan} onClose={() => setScanning(false)} />}

      {/* search + scan */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="size-4.5 text-subtle absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            strokeWidth={2}
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product, code or barcode…"
            autoComplete="off"
            className={`${inputCls} w-full pl-10`}
            aria-label="Search product"
          />
        </div>
        {canScan && (
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="pressable cursor-pointer rounded-xl border border-border bg-surface px-3.5 min-h-11 inline-flex items-center gap-2 font-semibold text-sm"
          >
            <ScanBarcode className="size-5" strokeWidth={2} aria-hidden />
            Scan
          </button>
        )}
      </div>

      {/* search results */}
      {matches.length > 0 && (
        <div className="rounded-xl border border-border bg-surface divide-y divide-border max-h-72 overflow-y-auto">
          {matches.slice(0, 8).map((p) => {
            const left = p.qty - inCart(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={left <= 0}
                onClick={() => addProduct(p)}
                className="pressable cursor-pointer w-full text-left px-3.5 py-2.5 min-h-11 hover:bg-background disabled:opacity-50 flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-sm truncate">
                    <span className="text-subtle font-normal tabular">{p.code}</span> · {p.name}
                  </span>
                  <span className="block text-xs text-subtle">{left} in stock</span>
                </span>
                <span className="tabular font-semibold text-sm shrink-0">{aed(p.price)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* cart */}
      {cart.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-subtle">
          <ShoppingCart className="size-7" strokeWidth={2} aria-hidden />
          <p className="text-sm">Cart is empty — search or scan to add items.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cart.map((line, idx) => (
            <div key={line.product.id} className="rounded-xl border border-border bg-background p-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm min-w-0 truncate">
                  <span className="text-subtle font-normal tabular">{line.product.code}</span> · {line.product.name}
                </p>
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                  className="pressable cursor-pointer p-2 rounded-lg text-subtle hover:text-destructive-text shrink-0"
                >
                  <Trash2 className="size-4" strokeWidth={2} aria-hidden />
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="inline-flex items-center rounded-xl border border-border overflow-hidden">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() =>
                      line.quantity > 1
                        ? patchLine(idx, { quantity: line.quantity - 1, imeis: line.imeis.slice(0, line.quantity - 1) })
                        : setCart((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="pressable cursor-pointer px-3 py-2 min-h-11 min-w-11 flex items-center justify-center"
                  >
                    <Minus className="size-4" strokeWidth={2} aria-hidden />
                  </button>
                  <span className="px-3 font-display font-semibold tabular min-w-8 text-center">{line.quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={line.quantity >= line.product.qty}
                    onClick={() => patchLine(idx, { quantity: line.quantity + 1 })}
                    className="pressable cursor-pointer px-3 py-2 min-h-11 min-w-11 flex items-center justify-center disabled:opacity-40"
                  >
                    <Plus className="size-4" strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <label className="flex items-center gap-2 flex-1 min-w-36">
                  <span className="text-xs text-subtle font-semibold">AED</span>
                  <input
                    value={line.unitPrice}
                    inputMode="decimal"
                    onChange={(e) => patchLine(idx, { unitPrice: e.target.value })}
                    aria-label="Unit price"
                    className={`${inputCls} w-full py-1.5 min-h-9 tabular text-sm`}
                  />
                </label>
                <span className="tabular font-semibold ml-auto">
                  {aed((Number(line.unitPrice) || 0) * line.quantity)}
                </span>
              </div>
              <ImeiEditor
                line={line}
                taken={usedImeis(idx)}
                onChange={(imeis) => patchLine(idx, { imeis })}
              />
            </div>
          ))}

          {/* payment + customer + checkout */}
          <div className="rounded-xl border border-border bg-background p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-semibold">Total</p>
              <div className="text-right">
                <p className="font-display text-2xl font-semibold tabular">{aed(total)}</p>
                <p className="text-xs text-subtle">VAT 5% included</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["cash", "Cash", Banknote],
                  ["card", "Card", CreditCard],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPayment(key)}
                  className={`pressable cursor-pointer rounded-xl border px-3 py-2.5 min-h-11 inline-flex items-center justify-center gap-2 font-semibold text-sm ${
                    payment === key
                      ? "border-accent bg-accent-soft text-accent-text"
                      : "border-border bg-surface"
                  }`}
                >
                  <Icon className="size-4.5" strokeWidth={2} aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            {(showCustomer || needsCustomer) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={customer.name}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  placeholder={needsCustomer ? "Customer name (required)" : "Customer name"}
                  className={inputCls}
                />
                <input
                  value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                  placeholder="Phone"
                  className={inputCls}
                />
                <input
                  value={customer.address}
                  onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                  placeholder={needsCustomer ? "Address (required)" : "Address"}
                  className={inputCls}
                />
                <input
                  value={customer.trn}
                  onChange={(e) => setCustomer({ ...customer, trn: e.target.value })}
                  placeholder="Customer TRN (B2B)"
                  className={inputCls}
                />
              </div>
            )}
            {needsCustomer && (
              <p className="text-xs text-warning-text">
                Above AED 10,000 — FTA requires a full tax invoice with customer name and address.
              </p>
            )}
            {!showCustomer && !needsCustomer && (
              <button
                type="button"
                onClick={() => setShowCustomer(true)}
                className="cursor-pointer text-sm text-subtle underline underline-offset-2 self-start"
              >
                + Add customer details (optional)
              </button>
            )}

            {result && !result.ok && (
              <p className="text-sm font-medium text-destructive-text">{result.error}</p>
            )}
            <button
              type="button"
              disabled={pending || cart.length === 0}
              onClick={checkout}
              className="pressable cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-fg font-display font-semibold px-4 py-3 min-h-12 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-5 animate-spin" strokeWidth={2} aria-hidden />
              ) : (
                <Banknote className="size-5" strokeWidth={2} aria-hidden />
              )}
              Charge {aed(total)}
            </button>
          </div>
        </div>
      )}

      {result?.ok && (
        <div className="rounded-xl bg-accent-soft text-accent-text px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">{result.message}</p>
          {result.invoiceId && (
            <a
              href={`/invoices/${result.invoiceId}/print`}
              target="_blank"
              className="pressable inline-flex items-center gap-1.5 rounded-lg bg-accent text-accent-fg px-3 py-2 text-sm font-semibold shrink-0"
            >
              <Printer className="size-4" strokeWidth={2} aria-hidden />
              Print receipt
            </a>
          )}
        </div>
      )}
    </div>
  );
}
