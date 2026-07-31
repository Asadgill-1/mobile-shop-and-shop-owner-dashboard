"use client";

import { Loader2, Save } from "lucide-react";
import { createProduct, updateProduct } from "@/actions/products";
import { Feedback } from "./action-feedback";
import { PinPrompt, usePinRetry } from "./pin-prompt";
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
  min_price?: string | null;
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
  // usePinRetry rather than useActionState: a cost edit comes back needing a PIN, and React has
  // reset the form by then — the retry must re-send what was typed, not what the fields still show.
  const { result, pending, submit, retry } = usePinRetry((fd) =>
    (mode === "create" ? createProduct : updateProduct)(null, fd),
  );
  const specsText = Object.entries(defaults.specs ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return (
    <form action={submit} className="flex flex-col gap-4">
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
        <Field label="Lowest price you'd accept (optional)">
          <input
            name="min_price"
            inputMode="decimal"
            defaultValue={defaults.min_price ?? ""}
            placeholder="leave empty to skip"
            className={`${inputCls} tabular`}
          />
          <span className="text-xs text-subtle">
            Only used when the assistant bargains on its own. It never goes below this, and never
            below your cost.
          </span>
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
      {/* A cost edit, or a price cut past the limit, comes back needsPin. Approve re-sends the
          values that were submitted, so nothing typed is lost even though the form has reset. */}
      <PinPrompt result={result} pending={pending} onSubmit={retry} />
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
