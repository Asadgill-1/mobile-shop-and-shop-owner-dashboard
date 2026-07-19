"use client";

import { useActionState } from "react";
import { Loader2, ReceiptText } from "lucide-react";
import { createDraftOrder } from "@/actions/orders";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

export interface ProductOption {
  id: string;
  label: string; // "PR0001 · Samsung Galaxy S25 (5 in stock) — 3,400 AED"
}

const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle";

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
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Product</span>
        <select name="product_id" required className={`${inputCls} cursor-pointer`}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
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
