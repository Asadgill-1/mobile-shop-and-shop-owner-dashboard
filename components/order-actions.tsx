"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { confirmOrder, rejectOrder, type ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

/** Confirm / Reject on a draft card. One-shot: the card leaves the list on success. */
export function ConfirmRejectButtons({ orderId }: { orderId: string }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => setResult(await confirmOrder(orderId)));
  const reject = (formData: FormData) =>
    startTransition(async () => setResult(await rejectOrder(orderId, formData)));

  return (
    <div className="flex flex-col gap-2">
      {!rejecting ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="pressable cursor-pointer flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold px-3 py-2.5 min-h-11 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <Check className="size-4" strokeWidth={2} aria-hidden />
            )}
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="pressable cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-xl border border-border text-destructive-text text-sm font-semibold px-3 py-2.5 min-h-11 disabled:opacity-60"
          >
            <X className="size-4" strokeWidth={2} aria-hidden />
            Reject
          </button>
        </div>
      ) : (
        <form action={reject} className="flex gap-2">
          <input
            name="reason"
            placeholder="Reason (goes to the owner's report)"
            autoFocus
            className="flex-1 min-w-0 rounded-xl border border-border bg-background px-3 py-2 min-h-11 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="pressable cursor-pointer rounded-xl bg-destructive text-white text-sm font-semibold px-3 min-h-11 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden /> : "Reject"}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="pressable cursor-pointer rounded-xl border border-border text-sm font-semibold px-3 min-h-11"
          >
            Back
          </button>
        </form>
      )}
      <Feedback result={result} />
    </div>
  );
}
