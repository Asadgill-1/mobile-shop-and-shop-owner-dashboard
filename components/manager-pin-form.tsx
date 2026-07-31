"use client";

// Owner-only (the action refuses anyone else). Setting a PIN is the ONE thing a keeper must not be
// able to do — a ceiling the person under it can move is not a ceiling.
import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { setManagerPin } from "@/actions/settings";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base tabular placeholder:text-subtle";

export function ManagerPinForm({ shopId, isSet }: { shopId: string; isSet: boolean }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(
    setManagerPin,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="shop_id" value={shopId} />
      <p className="text-xs text-subtle">
        Asked for at the till when someone discounts past the limit, rings an item below cost, voids
        a big or older sale, cancels a large order, corrects stock, edits a cost price, or changes the
        TRN. Everything else stays one tap.
        {isSet
          ? " Setting a new one replaces it and clears any lockout."
          : " Until one is set nothing is blocked — but every over-limit action is logged for you to read."}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">New PIN (6+ digits)</span>
        <input name="new_pin" type="password" inputMode="numeric" autoComplete="new-password" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">Repeat it</span>
        <input name="confirm_pin" type="password" inputMode="numeric" autoComplete="new-password" className={inputCls} />
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
          <KeyRound className="size-4" strokeWidth={2} aria-hidden />
        )}
        {isSet ? "Replace PIN" : "Set PIN"}
      </button>
    </form>
  );
}
