"use client";

import { useActionState, useState } from "react";
import { HandCoins, Loader2, UserPlus } from "lucide-react";
import { addRider, reconcileCod } from "@/actions/riders";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";
import type { ShopRef } from "@/lib/scope";

const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle";

export function AddRiderForm({ shops }: { shops: ShopRef[] }) {
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(addRider, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable cursor-pointer inline-flex items-center gap-2 rounded-xl bg-accent text-accent-fg text-sm font-semibold px-4 py-2.5 min-h-11"
      >
        <UserPlus className="size-4" strokeWidth={2} aria-hidden />
        Add rider
      </button>
    );
  }
  return (
    <form
      action={action}
      className="bg-surface border border-border rounded-2xl shadow-card p-4 flex flex-col gap-3 max-w-md"
    >
      <p className="font-display font-semibold">New rider</p>
      {shops.length > 1 ? (
        <select name="shop_id" aria-label="Shop" className={`${inputCls} cursor-pointer`}>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="shop_id" value={shops[0]?.id} />
      )}
      <input name="name" required placeholder="Rider name" className={inputCls} />
      <input name="phone" required type="tel" placeholder="Phone (e.g. 0501234567)" className={inputCls} />
      <Feedback result={result} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="pressable cursor-pointer flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-fg text-sm font-semibold px-4 min-h-11 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden /> : null}
          Add rider
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="pressable cursor-pointer rounded-xl border border-border text-sm font-semibold px-4 min-h-11"
        >
          Close
        </button>
      </div>
      <p className="text-xs text-subtle">
        The rider connects by pressing /start on the rider bot and sharing this phone number.
      </p>
    </form>
  );
}

/** End-of-day cash handover (mirror of /reconcilecod). */
export function ReconcileForm({ riderId, riderName }: { riderId: string; riderName: string }) {
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(
    reconcileCod,
    null,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-border text-sm font-semibold px-3 py-2 min-h-11"
      >
        <HandCoins className="size-4" strokeWidth={2} aria-hidden />
        Reconcile
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="rider_id" value={riderId} />
      <div className="flex gap-2">
        <input
          name="amount"
          inputMode="decimal"
          required
          placeholder={`Cash from ${riderName} (AED)`}
          aria-label="Handover amount in AED"
          autoFocus
          className={`${inputCls} flex-1 min-w-0 tabular`}
        />
        <button
          type="submit"
          disabled={pending}
          className="pressable cursor-pointer rounded-xl bg-accent text-accent-fg text-sm font-semibold px-3.5 min-h-11 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden /> : "Record"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="pressable cursor-pointer rounded-xl border border-border text-sm font-semibold px-3 min-h-11"
        >
          Back
        </button>
      </div>
      <Feedback result={result} />
    </form>
  );
}
