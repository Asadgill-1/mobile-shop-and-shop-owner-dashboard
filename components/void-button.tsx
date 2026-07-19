"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { voidSale } from "@/actions/pos";

export function VoidButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-destructive-text">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await voidSale(saleId);
            if (!res.ok) setError(res.error ?? "Failed.");
            else router.refresh();
          })
        }
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
