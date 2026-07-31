"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { voidSale } from "@/actions/pos";
import type { ActionResult } from "@/actions/orders";
import { PinPrompt } from "./pin-prompt";

export function VoidButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  // Over the limit, or not today's sale, comes back needsPin — the same call goes again with it.
  const run = (pin?: string) =>
    start(async () => {
      const res = await voidSale(saleId, pin);
      setResult(res);
      if (res.ok) router.refresh();
    });

  return (
    // Column, not a row: the PIN prompt needs the width, and the sale list it sits in wraps.
    <span className="flex flex-col items-end gap-2">
      {result && !result.ok && !result.needsPin && (
        <span className="text-xs text-destructive-text">{result.error}</span>
      )}
      <PinPrompt result={result} pending={pending} onSubmit={(pin) => run(pin)} />
      <button
        type="button"
        disabled={pending}
        onClick={() => run()}
        className="pressable cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-subtle hover:text-destructive-text disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Undo2 className="size-3.5" strokeWidth={2} aria-hidden />
        )}
        Void
      </button>
    </span>
  );
}
