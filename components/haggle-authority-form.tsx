"use client";

// How far the assistant may bargain before it has to ask you (migration 027).
//
// On (the default) is exactly the old behaviour: every haggle reaches you. Off gives the
// assistant a bounded mandate — it can settle instantly instead of leaving the customer waiting,
// and you stop being pinged for every "bhai thora kam karo". The floor is worked out on the
// server from this percentage, the product's own minimum price, and your cost. It can never
// sell below cost, whatever a customer claims.
import { useActionState, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { setHaggleAuthority } from "@/actions/settings";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

export function HaggleAuthorityForm({
  shopId,
  askEveryTime,
  maxDiscountPct,
}: {
  shopId: string;
  askEveryTime: boolean;
  maxDiscountPct: number;
}) {
  const [ask, setAsk] = useState(askEveryTime);
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(
    setHaggleAuthority,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="shop_id" value={shopId} />
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="ask_every_time"
          checked={ask}
          onChange={(e) => setAsk(e.target.checked)}
          className="size-5 accent-[var(--accent)]"
        />
        <span className="flex-1">
          <span className="text-sm font-semibold block">Ask me before every discount</span>
          <span className="text-xs text-subtle">
            {ask
              ? "Every haggle comes to you. The customer waits for your answer."
              : "The assistant settles small discounts itself and tells you afterwards."}
          </span>
        </span>
      </label>

      <label className={`flex flex-col gap-1 ${ask ? "opacity-50" : ""}`}>
        <span className="text-xs font-semibold text-subtle">
          Most it may take off by itself (%)
        </span>
        <input
          name="max_discount_pct"
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          max={100}
          disabled={ask}
          defaultValue={String(maxDiscountPct ?? 0)}
          className="rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base tabular disabled:cursor-not-allowed"
        />
        <span className="text-xs text-subtle">
          A product with its own minimum price uses that instead. Never below your cost.
        </span>
      </label>

      <Feedback result={result} />
      <button
        type="submit"
        disabled={pending}
        className="pressable cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-fg font-semibold px-4 py-2.5 min-h-11 text-sm disabled:opacity-60 self-start"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Save className="size-4" strokeWidth={2} aria-hidden />
        )}
        Save bargaining
      </button>
    </form>
  );
}
