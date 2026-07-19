"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";
import { setInvoiceIdentity } from "@/actions/settings";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle";

export function InvoiceIdentityForm({
  shopId,
  trn,
  name,
  address,
}: {
  shopId: string;
  trn: string | null;
  name: string | null;
  address: string | null;
}) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(
    setInvoiceIdentity,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="shop_id" value={shopId} />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">TRN (15 digits)</span>
        <input
          name="trn"
          defaultValue={trn ?? ""}
          inputMode="numeric"
          placeholder="100123456700003"
          className={`${inputCls} tabular`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">Legal name on invoices</span>
        <input name="invoice_name" defaultValue={name ?? ""} placeholder="Shop legal name" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">Address on invoices</span>
        <input name="invoice_address" defaultValue={address ?? ""} placeholder="Street, area, emirate" className={inputCls} />
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
          <Save className="size-4" strokeWidth={2} aria-hidden />
        )}
        Save invoice details
      </button>
    </form>
  );
}
