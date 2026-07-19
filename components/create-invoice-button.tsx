"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";
import { createInvoiceFromOrder } from "@/actions/invoices";

export function CreateInvoiceButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      {error && <span className="text-xs text-destructive-text">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await createInvoiceFromOrder(orderId);
            if (!res.ok) setError(res.error ?? "Failed.");
            else if (res.invoiceId) router.push(`/invoices/${res.invoiceId}`);
            else router.refresh();
          })
        }
        className="pressable cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-accent text-accent-fg px-3 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <FilePlus2 className="size-4" strokeWidth={2} aria-hidden />
        )}
        Invoice
      </button>
    </span>
  );
}
