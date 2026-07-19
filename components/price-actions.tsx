"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { approvePrice, denyPrice, type ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

/** Approve / Counter / Deny on a pending price request (bot parity: kappr/kcust/kdeny). */
export function PriceActions({ requestNumber }: { requestNumber: number }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [countering, setCountering] = useState(false);
  const [price, setPrice] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => setResult(await fn()));

  return (
    <div className="flex flex-col gap-2">
      {!countering ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => run(() => approvePrice(requestNumber, null))}
            disabled={pending}
            className="pressable cursor-pointer flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold px-3 py-2.5 min-h-11 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <Check className="size-4" strokeWidth={2} aria-hidden />
            )}
            Approve
          </button>
          <button
            type="button"
            onClick={() => setCountering(true)}
            disabled={pending}
            className="pressable cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold px-3 py-2.5 min-h-11 disabled:opacity-60"
          >
            <Pencil className="size-4" strokeWidth={2} aria-hidden />
            Counter
          </button>
          <button
            type="button"
            onClick={() => run(() => denyPrice(requestNumber))}
            disabled={pending}
            className="pressable cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-xl border border-border text-destructive-text text-sm font-semibold px-3 py-2.5 min-h-11 disabled:opacity-60"
          >
            <X className="size-4" strokeWidth={2} aria-hidden />
            Deny
          </button>
        </div>
      ) : (
        <form
          action={() => {
            const n = Number(price);
            if (!Number.isFinite(n) || n <= 0) {
              setResult({ ok: false, error: "Enter your counter price in AED." });
              return;
            }
            run(() => approvePrice(requestNumber, n));
          }}
          className="flex gap-2"
        >
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Your price (AED)"
            autoFocus
            aria-label="Counter price in AED"
            className="flex-1 min-w-0 rounded-xl border border-border bg-background px-3 py-2 min-h-11 text-sm tabular"
          />
          <button
            type="submit"
            disabled={pending}
            className="pressable cursor-pointer rounded-xl bg-accent text-accent-fg text-sm font-semibold px-3 min-h-11 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden /> : "Send"}
          </button>
          <button
            type="button"
            onClick={() => setCountering(false)}
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
