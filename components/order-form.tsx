"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { Loader2, PackageSearch, ReceiptText, Search, X } from "lucide-react";
import { createDraftOrder } from "@/actions/orders";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

export interface ProductOption {
  id: string;
  code: string; // "PR0005"
  name: string; // "Apple iPhone 16 Green"
  qty: number;
  price: string; // pre-formatted "AED 3,399"
}

const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle";

/** Type-to-search picker: "iphone" → every iPhone with code, stock and price; tap to select. */
function ProductPicker({ products }: { products: ProductOption[] }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ProductOption | null>(null);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = tokens.length
    ? products.filter((p) => {
        const hay = `${p.code} ${p.name}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
    : products;
  const shown = matches.slice(0, 8);

  const pick = (p: ProductOption) => {
    setPicked(p);
    setQuery(`${p.code} · ${p.name}`);
    setOpen(false);
  };

  return (
    <label className="flex flex-col gap-1.5 relative">
      <span className="text-sm font-semibold">Product</span>
      <input type="hidden" name="product_id" value={picked?.id ?? ""} />
      <div className="relative">
        <Search
          className="size-4.5 text-subtle absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          strokeWidth={2}
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null); // editing invalidates the previous pick
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // let an option's onMouseDown land before the list closes
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          placeholder="Search product… e.g. iphone"
          autoComplete="off"
          required
          className={`${inputCls} w-full pl-10 ${picked ? "pr-10 border-accent" : ""}`}
          aria-label="Search product"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear product"
            onClick={() => {
              setQuery("");
              setPicked(null);
              setOpen(true);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-subtle hover:text-foreground cursor-pointer"
          >
            <X className="size-4" strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
      {open && !picked && (
        <div className="absolute z-20 top-full mt-1.5 w-full rounded-xl border border-border bg-surface shadow-lg max-h-80 overflow-y-auto">
          {shown.length === 0 ? (
            <div className="flex items-center gap-2.5 px-3.5 py-3 text-sm text-subtle">
              <PackageSearch className="size-4.5" strokeWidth={2} aria-hidden />
              No product matches “{query}”
            </div>
          ) : (
            shown.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={() => pick(p)}
                className="pressable cursor-pointer w-full text-left px-3.5 py-2.5 min-h-11 border-b border-border last:border-b-0 hover:bg-background"
              >
                <span className="block font-semibold text-sm">
                  <span className="text-subtle font-normal tabular">{p.code}</span> · {p.name}
                </span>
                <span className="block text-xs text-subtle mt-0.5">
                  {p.qty} in stock — <span className="tabular font-medium">{p.price}</span>
                </span>
              </button>
            ))
          )}
          {matches.length > shown.length && (
            <div className="px-3.5 py-2 text-xs text-subtle border-t border-border">
              {matches.length - shown.length} more — keep typing to narrow down
            </div>
          )}
        </div>
      )}
    </label>
  );
}

/** Manual order — lands as a draft so confirm/stock/notify reuse the one pipeline. */
export function OrderForm({
  shopId,
  products,
}: {
  shopId: string;
  products: ProductOption[];
}) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(
    createDraftOrder,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4 max-w-lg">
      <input type="hidden" name="shop_id" value={shopId} />
      <ProductPicker products={products} />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Quantity</span>
          <input name="quantity" inputMode="numeric" required defaultValue={1} className={`${inputCls} tabular`} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Delivery date (optional)</span>
          <input name="delivery_date" type="date" className={inputCls} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Customer name</span>
        <input name="customer_name" required placeholder="Ahmed Khan" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Phone / Telegram id</span>
        <input name="phone" required placeholder="0501234567" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Delivery address</span>
        <input name="address" required placeholder="Street, area, city" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Special instructions (optional)</span>
        <input name="special_instructions" placeholder="Call before delivery…" className={inputCls} />
      </label>
      <Feedback result={result} />
      <button
        type="submit"
        disabled={pending}
        className="pressable cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-fg font-display font-semibold px-4 py-3 min-h-12 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <ReceiptText className="size-5" strokeWidth={2} aria-hidden />
        )}
        Create draft
      </button>
      <p className="text-xs text-subtle">
        The order lands in Drafts — confirming it commits the stock and messages the customer.
      </p>
    </form>
  );
}
