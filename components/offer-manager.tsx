"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift, Loader2, Plus, X } from "lucide-react";
import { createOffer, endOffer } from "@/actions/offers";
import type { ActionResult } from "@/actions/orders";
import type { OfferType } from "@/lib/types";
import { Feedback } from "./action-feedback";

export interface ActiveOffer {
  id: string;
  type: OfferType;
  label: string;
  value: string | null;
}
export interface GiftOption {
  id: string;
  label: string;
}

const TYPE_LABELS: Record<OfferType, string> = {
  free_gift: "Free gift with purchase",
  free_delivery: "Free home delivery",
  percent_off: "% off",
  amount_off: "Amount off (AED)",
  bogo: "Buy N get 1 free",
  bulk: "Bulk discount (buy N+)",
};

const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle";

/** One active offer per product: shows the current one (with End), else the create form. */
export function OfferManager({
  productId,
  offer,
  giftOptions,
}: {
  productId: string;
  offer: ActiveOffer | null;
  giftOptions: GiftOption[];
}) {
  const router = useRouter();
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(createOffer, null);
  const [type, setType] = useState<OfferType>("free_gift");
  const [ending, startEnd] = useTransition();

  if (offer) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-xl bg-accent-soft text-accent-text px-3.5 py-3">
          <Gift className="size-5 shrink-0" strokeWidth={2} aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{offer.label}</p>
            <p className="text-xs opacity-80">{TYPE_LABELS[offer.type]}</p>
          </div>
          <button
            type="button"
            disabled={ending}
            onClick={() => startEnd(async () => { await endOffer(offer.id); router.refresh(); })}
            className="pressable cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
          >
            {ending ? <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden /> : <X className="size-3.5" strokeWidth={2} aria-hidden />}
            End
          </button>
        </div>
        <p className="text-xs text-subtle">The AI mentions this to customers and it applies automatically at sale.</p>
      </div>
    );
  }

  const needsGift = type === "free_gift";
  const needsValue = ["percent_off", "amount_off", "bogo", "bulk"].includes(type);

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="product_id" value={productId} />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">Offer type</span>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as OfferType)}
          className={inputCls}
        >
          {(Object.keys(TYPE_LABELS) as OfferType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      {needsGift ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">Gift product (stock decrements when sold)</span>
          <select name="gift_product_id" className={inputCls} required>
            <option value="">Pick a product…</option>
            {giftOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {needsValue ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">
            {type === "percent_off"
              ? "Percent off (1–100)"
              : type === "amount_off"
                ? "Amount off (AED)"
                : type === "bogo"
                  ? "Buy how many to get 1 free?"
                  : "Minimum quantity"}
          </span>
          <input name="value" type="number" inputMode="decimal" min="1" className={`${inputCls} tabular`} required />
        </label>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">Customer-facing text (optional)</span>
        <input name="label" placeholder="Auto-generated if blank" className={inputCls} />
      </label>

      <Feedback result={result} />
      <button
        type="submit"
        disabled={pending}
        className="pressable cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-fg font-semibold px-4 py-2.5 min-h-11 text-sm disabled:opacity-60 self-start"
      >
        {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden /> : <Plus className="size-4" strokeWidth={2} aria-hidden />}
        Add offer
      </button>
    </form>
  );
}
