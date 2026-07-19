"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setNegotiation } from "@/actions/settings";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

/** Live negotiation switch (mirror of /negotiation on|off). */
export function NegotiationToggle({
  shopId,
  enabled,
}: {
  shopId: string;
  enabled: boolean;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const flip = () =>
    startTransition(async () => setResult(await setNegotiation(shopId, !enabled)));

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Price negotiation"
        onClick={flip}
        disabled={pending}
        className={`pressable cursor-pointer relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
          enabled ? "bg-accent" : "bg-border"
        } disabled:opacity-60`}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin mx-auto text-white" strokeWidth={2} aria-hidden />
        ) : (
          <span
            className={`inline-block size-6 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-7" : "translate-x-1"
            }`}
            aria-hidden
          />
        )}
      </button>
      <Feedback result={result} />
    </div>
  );
}
