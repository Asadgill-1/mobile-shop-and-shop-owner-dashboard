"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { setVatProfile } from "@/actions/settings";
import { EMIRATES, QUARTER_ANCHORS } from "@/lib/vat";
import { Feedback } from "./action-feedback";
import { PinPrompt, usePinRetry } from "./pin-prompt";

const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle";

export function VatProfileForm({
  shopId,
  emirate,
  vatPeriod,
  quarterAnchor,
}: {
  shopId: string;
  emirate: string | null;
  vatPeriod: string;
  quarterAnchor: number;
}) {
  const { result, pending, submit, retry } = usePinRetry((fd) => setVatProfile(null, fd));
  // The quarter cycle only means anything to a quarterly filer, so it appears only for one.
  const [period, setPeriod] = useState(vatPeriod);

  return (
    <form action={submit} className="flex flex-col gap-2.5">
      <input type="hidden" name="shop_id" value={shopId} />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">Emirate of supply</span>
        <select name="emirate" defaultValue={emirate ?? ""} className={inputCls}>
          <option value="">Not set</option>
          {EMIRATES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <span className="text-xs text-subtle">
          The VAT return splits standard-rated sales by emirate — this is the one they file under.
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">Filing period</span>
        <select
          name="vat_period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className={inputCls}
        >
          <option value="quarterly">Quarterly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      {period === "quarterly" ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">Quarters end in</span>
          <select name="vat_quarter_anchor" defaultValue={String(quarterAnchor)} className={inputCls}>
            {QUARTER_ANCHORS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-subtle">
            The FTA staggers quarters — copy this from the VAT certificate, most shops are not on
            calendar quarters.
          </span>
        </label>
      ) : (
        <input type="hidden" name="vat_quarter_anchor" value={quarterAnchor} />
      )}
      <Feedback result={result} />
      {/* Changing the emirate re-files the period's sales under a different VAT201 box, so it asks
          for the manager PIN exactly like the TRN does. Changing only the filing period never does. */}
      <PinPrompt result={result} pending={pending} onSubmit={retry} />
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
        Save VAT details
      </button>
    </form>
  );
}
