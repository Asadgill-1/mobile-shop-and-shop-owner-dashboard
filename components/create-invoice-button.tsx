"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";
import { createInvoiceFromOrder } from "@/actions/invoices";

const SERIALIZED = ["Mobile", "Tablet"];

/** Creates the tax invoice for a delivered order. For Mobile/Tablet it first collects the shipped
 *  unit's IMEI(s) (compulsory — the invoice carries them and product_units flips sold). */
export function CreateInvoiceButton({
  orderId,
  category,
  quantity = 1,
}: {
  orderId: string;
  category?: string;
  quantity?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [imeiOpen, setImeiOpen] = useState(false);
  const [imeiText, setImeiText] = useState("");
  const needsImei = !!category && SERIALIZED.includes(category);

  const run = (imeis: string[]) =>
    start(async () => {
      setError(null);
      const res = await createInvoiceFromOrder(orderId, imeis);
      if (!res.ok) setError(res.error ?? "Failed.");
      else if (res.invoiceId) router.push(`/invoices/${res.invoiceId}`);
      else router.refresh();
    });

  const onClick = () => {
    if (needsImei && !imeiOpen) {
      setImeiOpen(true);
      return;
    }
    run(needsImei ? imeiText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) : []);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2 shrink-0">
      {error && <span className="text-xs text-destructive-text">{error}</span>}
      {imeiOpen ? (
        <input
          value={imeiText}
          onChange={(e) => setImeiText(e.target.value)}
          placeholder={quantity > 1 ? `${quantity} IMEIs, comma-separated` : "IMEI / serial"}
          aria-label="IMEI(s) for this order"
          autoFocus
          className="w-44 rounded-lg border border-border bg-background px-2.5 py-2 text-sm tabular"
        />
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="pressable cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-accent text-accent-fg px-3 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <FilePlus2 className="size-4" strokeWidth={2} aria-hidden />
        )}
        {imeiOpen ? "Create invoice" : "Invoice"}
      </button>
    </span>
  );
}
