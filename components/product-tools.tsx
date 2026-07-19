"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Star, Trash2 } from "lucide-react";
import {
  adjustStock,
  deleteProduct,
  setBoost,
  toggleFeatured,
  toggleTag,
} from "@/actions/products";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

const ALL_TAGS = [
  "clearance", "trending", "best_camera", "long_battery", "gaming", "budget",
  "premium", "high_margin", "staff_pick", "new_arrival", "limited_stock",
];

/** Boost slider + tag chips + featured + quick stock ± + delete (PLAN §5.3). */
export function ProductTools({
  productId,
  boost,
  tags,
  featured,
  quantity,
}: {
  productId: string;
  boost: number;
  tags: string[];
  featured: boolean;
  quantity: number;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [level, setLevel] = useState(boost);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await fn();
      setResult(r);
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Stock</p>
          <p className="font-display font-semibold tabular">{quantity}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Remove one from stock"
            onClick={() => run(() => adjustStock(productId, -1))}
            disabled={pending || quantity === 0}
            className="pressable cursor-pointer flex-1 rounded-xl border border-border min-h-11 flex items-center justify-center disabled:opacity-40"
          >
            <Minus className="size-5" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Add one to stock"
            onClick={() => run(() => adjustStock(productId, 1))}
            disabled={pending}
            className="pressable cursor-pointer flex-1 rounded-xl bg-accent text-accent-fg min-h-11 flex items-center justify-center disabled:opacity-60"
          >
            <Plus className="size-5" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Boost (search ranking)</p>
          <p className="font-display font-semibold tabular">{level}</p>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          value={level}
          aria-label="Boost level"
          onChange={(e) => setLevel(Number(e.target.value))}
          onPointerUp={() => run(() => setBoost(productId, level))}
          onKeyUp={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") run(() => setBoost(productId, level));
          }}
          className="w-full accent-[var(--accent)] cursor-pointer min-h-11"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Tags (the AI promotes these)</p>
        <div className="flex flex-wrap gap-2">
          {ALL_TAGS.map((t) => {
            const active = tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => run(() => toggleTag(productId, t))}
                disabled={pending}
                aria-pressed={active}
                className={`pressable cursor-pointer rounded-full px-3 py-2 min-h-10 text-xs font-semibold ${
                  active
                    ? "bg-primary text-primary-fg"
                    : "bg-surface border border-border text-subtle"
                }`}
              >
                {t.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => run(() => toggleFeatured(productId))}
        disabled={pending}
        aria-pressed={featured}
        className={`pressable cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 min-h-11 text-sm font-semibold ${
          featured ? "bg-warning text-white" : "border border-border text-subtle"
        }`}
      >
        <Star className="size-4" strokeWidth={2} aria-hidden />
        {featured ? "Featured — tap to unfeature" : "Feature this product"}
      </button>

      <Feedback result={result} />

      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => {
            if (!window.confirm("Delete this product and its photos? This can't be undone.")) return;
            startTransition(async () => {
              const r = await deleteProduct(productId);
              if (r.ok) router.push("/inventory");
              else setResult(r);
            });
          }}
          disabled={pending}
          className="pressable cursor-pointer inline-flex items-center gap-2 rounded-xl text-destructive-text text-sm font-semibold px-3 py-2.5 min-h-11 hover:bg-destructive-soft disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            <Trash2 className="size-4" strokeWidth={2} aria-hidden />
          )}
          Delete product
        </button>
      </div>
    </div>
  );
}
