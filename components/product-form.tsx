"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";
import { createProduct, updateProduct } from "@/actions/products";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";
import type { ShopRef } from "@/lib/scope";

const CATEGORIES = ["Mobile", "Laptop", "Tablet", "Accessory"];
const CONDITIONS = ["New", "Used", "Refurbished"];

export interface ProductDefaults {
  id?: string;
  category?: string;
  brand?: string;
  model?: string;
  color?: string | null;
  condition?: string;
  specs?: Record<string, string>;
  cost_price?: string;
  selling_price?: string;
  quantity?: number;
  min_qty?: number;
  barcode?: string | null;
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle";

/** One form for both /addproduct (create) and full edit (PLAN §5.3). */
export function ProductForm({
  mode,
  shops,
  shopId,
  defaults = {},
}: {
  mode: "create" | "edit";
  shops?: ShopRef[]; // create + multi-shop: pick where it goes
  shopId?: string;
  defaults?: ProductDefaults;
}) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(
    mode === "create" ? createProduct : updateProduct,
    null,
  );
  const specsText = Object.entries(defaults.specs ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return (
    <form action={action} className="flex flex-col gap-4">
      {mode === "create" ? (
        shops && shops.length > 1 ? (
          <Field label="Shop">
            <select name="shop_id" className={`${inputCls} cursor-pointer`} defaultValue={shopId}>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <input type="hidden" name="shop_id" value={shopId} />
        )
      ) : (
        <input type="hidden" name="product_id" value={defaults.id} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select name="category" defaultValue={defaults.category ?? "Mobile"} className={`${inputCls} cursor-pointer`}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Condition">
          <select name="condition" defaultValue={defaults.condition ?? "New"} className={`${inputCls} cursor-pointer`}>
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Brand">
          <input name="brand" required defaultValue={defaults.brand} placeholder="Samsung" className={inputCls} />
        </Field>
        <Field label="Model">
          <input name="model" required defaultValue={defaults.model} placeholder="Galaxy S25 Ultra" className={inputCls} />
        </Field>
        <Field label="Color (optional)">
          <input name="color" defaultValue={defaults.color ?? ""} placeholder="Titanium Black" className={inputCls} />
        </Field>
        <Field label="Cost price (AED)">
          <input name="cost_price" required inputMode="decimal" defaultValue={defaults.cost_price} placeholder="2800" className={`${inputCls} tabular`} />
        </Field>
        <Field label="Selling price (AED)">
          <input name="selling_price" required inputMode="decimal" defaultValue={defaults.selling_price} placeholder="3400" className={`${inputCls} tabular`} />
        </Field>
        {mode === "create" ? (
          <Field label="Quantity in stock">
            <input name="quantity" required inputMode="numeric" defaultValue={defaults.quantity ?? 0} className={`${inputCls} tabular`} />
          </Field>
        ) : null}
        <Field label="Low-stock alert at (0 = off)">
          <input name="min_qty" inputMode="numeric" defaultValue={defaults.min_qty ?? 0} className={`${inputCls} tabular`} />
        </Field>
        <Field label="Barcode (optional — POS scan)">
          <input name="barcode" defaultValue={defaults.barcode ?? ""} placeholder="EAN on the box" className={`${inputCls} tabular`} />
        </Field>
      </div>

      {mode === "create" ? (
        <Field label="IMEIs / serials — one per line (phones & tablets)">
          <textarea
            name="imeis"
            rows={3}
            placeholder={"356789104829301\n356789104829302"}
            className={`${inputCls} min-h-20 font-mono text-sm`}
          />
        </Field>
      ) : null}

      <Field label="Specs — one per line, key: value">
        <textarea
          name="specs"
          rows={4}
          defaultValue={specsText}
          placeholder={"camera: 200MP\nbattery: 5000mAh\nstorage: 512GB"}
          className={`${inputCls} min-h-24 font-mono text-sm`}
        />
      </Field>

      <Feedback result={result} />
      <button
        type="submit"
        disabled={pending}
        className="pressable cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-fg font-display font-semibold px-4 py-3 min-h-12 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Save className="size-5" strokeWidth={2} aria-hidden />
        )}
        {mode === "create" ? "Add product" : "Save changes"}
      </button>
    </form>
  );
}
