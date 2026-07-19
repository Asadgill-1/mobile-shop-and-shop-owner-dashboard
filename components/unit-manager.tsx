"use client";

// IMEI unit ledger per product: add stock WITH IMEIs, remove a typo'd in-stock IMEI.
// products.quantity stays the stock source of truth; a mismatch badge is shown by the page.
import { useActionState, useState, useTransition } from "react";
import { Loader2, PackagePlus, X } from "lucide-react";
import { addUnits, deleteUnit } from "@/actions/products";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle";

export interface UnitItem {
  id: string;
  imei: string;
  status: "in_stock" | "sold";
  sold_at: string | null;
}

function UnitChip({ unit }: { unit: UnitItem }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs tabular ${
        unit.status === "sold" ? "bg-muted text-subtle line-through" : "bg-accent-soft text-accent-text"
      }`}
    >
      {unit.imei}
      {unit.status === "in_stock" && (
        <button
          type="button"
          aria-label={`Remove ${unit.imei}`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteUnit(unit.id);
              if (res.ok) setGone(true);
            })
          }
          className="cursor-pointer hover:text-destructive-text"
        >
          {pending ? (
            <Loader2 className="size-3 animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            <X className="size-3" strokeWidth={2} aria-hidden />
          )}
        </button>
      )}
    </span>
  );
}

export function UnitManager({ productId, units }: { productId: string; units: UnitItem[] }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(addUnits, null);
  const inStock = units.filter((u) => u.status === "in_stock");
  const sold = units.filter((u) => u.status === "sold");

  return (
    <div className="flex flex-col gap-3">
      {inStock.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {inStock.map((u) => (
            <UnitChip key={u.id} unit={u} />
          ))}
        </div>
      )}
      {sold.length > 0 && (
        <details>
          <summary className="text-xs text-subtle cursor-pointer">
            {sold.length} sold unit(s)
          </summary>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {sold.map((u) => (
              <UnitChip key={u.id} unit={u} />
            ))}
          </div>
        </details>
      )}
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="product_id" value={productId} />
        <textarea
          name="imeis"
          rows={2}
          placeholder={"Add stock with IMEIs — one per line\n356789104829301"}
          className={`${inputCls} min-h-16 font-mono text-sm`}
        />
        <Feedback result={result} />
        <button
          type="submit"
          disabled={pending}
          className="pressable cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface font-semibold px-4 py-2.5 min-h-11 text-sm disabled:opacity-60 self-start"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            <PackagePlus className="size-4" strokeWidth={2} aria-hidden />
          )}
          Add units to stock
        </button>
      </form>
    </div>
  );
}
