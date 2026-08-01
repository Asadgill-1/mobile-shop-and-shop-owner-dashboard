"use client";

// Booking a supplier bill (migration 036). Two forms, one file: the supplier has to exist before its
// bills do, and both live in the same drawer on /purchases.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Plus, Save } from "lucide-react";
import { addSupplier, bookPurchase, getScanUploadUrl } from "@/actions/purchases";
import { VAT_TREATMENTS, VAT_RATE } from "@/lib/vat";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle";
const btnCls =
  "pressable cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-fg font-semibold px-4 py-2.5 min-h-11 text-sm disabled:opacity-60 self-start";

export interface SupplierOption {
  id: string;
  name: string;
  trn: string | null;
}

export function SupplierForm({ shopId }: { shopId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          const r = await addSupplier(null, fd);
          setResult(r);
          if (r.ok) {
            // Cleared here, not left to React: its own reset waits for the whole transition, and
            // this one contains a router.refresh() round trip. See the note in PurchaseForm.
            formRef.current?.reset();
            router.refresh();
          }
        })
      }
      className="flex flex-col gap-2.5"
    >
      <input type="hidden" name="shop_id" value={shopId} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">Supplier name</span>
          <input name="name" required placeholder="Al Noor Trading" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">Their TRN (15 digits)</span>
          <input name="trn" inputMode="numeric" placeholder="optional" className={`${inputCls} tabular`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">Phone</span>
          <input name="phone" inputMode="tel" placeholder="optional" className={inputCls} />
        </label>
      </div>
      <Feedback result={result} />
      <button type="submit" disabled={pending} className={btnCls}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Plus className="size-4" strokeWidth={2} aria-hidden />
        )}
        Add supplier
      </button>
    </form>
  );
}

export function PurchaseForm({
  shopId,
  suppliers,
  today,
}: {
  shopId: string;
  suppliers: SupplierOption[];
  /** Today in Dubai (the server knows the timezone; the browser may be anywhere). */
  today: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const [subtotal, setSubtotal] = useState("");
  const [vat, setVat] = useState("");
  // Once someone types their own VAT figure, stop overwriting it — a partly-exempt bill is exactly
  // the one where 5% is wrong, and it is also the one where the shop most needs to be believed.
  const vatTouched = useRef(false);
  const scanInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubtotal = (v: string) => {
    setSubtotal(v);
    const n = Number(v);
    if (!vatTouched.current && Number.isFinite(n) && n > 0) {
      setVat((Math.round(n * VAT_RATE * 100) / 100).toFixed(2));
    }
  };

  const submit = (fd: FormData) =>
    start(async () => {
      // The scan goes straight from the browser to Storage (same flow as product media), so a 4 MB
      // photo of a bill never travels through a server action's body limit.
      const file = scanInput.current?.files?.[0];
      if (file) {
        const ticket = await getScanUploadUrl(shopId, file.name.split(".").pop() ?? "jpg");
        if (!ticket.ok) {
          setResult(ticket);
          return;
        }
        const put = await fetch(ticket.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) {
          setResult({ ok: false, error: "The scan didn't upload — try again." });
          return;
        }
        fd.set("scan_path", ticket.path);
      }
      const r = await bookPurchase(null, fd);
      setResult(r);
      if (r.ok) {
        // Reset the fields HERE rather than leaving it to React 19.
        //
        // React does reset an uncontrolled form after a function action — but only once the whole
        // transition settles, and this transition contains a router.refresh(), a full RSC round
        // trip. For the seconds in between, the form still holds the last bill's `recoverable` and
        // `notes`, and someone booking a stack of bills is typing into it. Caught live on
        // 2026-08-01: a reverse-charge import inherited the previous bill's "not claimable" and its
        // note. Under-claiming is the lucky direction; the same race the other way attaches a
        // claim to a bill the shop had marked ineligible.
        formRef.current?.reset(); // uncontrolled: number, date, treatment, tick-box, note, photo
        setSubtotal(""); // controlled: reset() does not touch React state
        setVat("");
        vatTouched.current = false;
        router.refresh();
      }
    });

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-subtle">Add a supplier first — a bill has to belong to someone.</p>
    );
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-col gap-2.5">
      <input type="hidden" name="shop_id" value={shopId} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">Supplier</span>
          <select name="supplier_id" required className={inputCls}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.trn ? "" : " (no TRN)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">Their invoice number</span>
          <input
            name="supplier_invoice_no"
            required
            placeholder="as printed on the bill"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">Date on the bill</span>
          <input type="date" name="invoice_date" required defaultValue={today} max={today} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">Amount before VAT</span>
          <input
            name="subtotal"
            required
            inputMode="decimal"
            value={subtotal}
            onChange={(e) => onSubtotal(e.target.value)}
            placeholder="0.00"
            className={`${inputCls} tabular`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">VAT on the bill</span>
          <input
            name="vat_amount"
            inputMode="decimal"
            value={vat}
            onChange={(e) => {
              vatTouched.current = true;
              setVat(e.target.value);
            }}
            placeholder="0.00"
            className={`${inputCls} tabular`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">VAT treatment</span>
          <select name="vat_treatment" defaultValue="standard" className={inputCls}>
            {VAT_TREATMENTS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-start gap-2.5 rounded-xl bg-muted px-3 py-2.5">
        <input
          type="checkbox"
          name="recoverable"
          defaultChecked
          className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
        />
        <span className="text-sm">
          <span className="font-semibold">Claim this VAT back</span>
          <span className="block text-xs text-subtle">
            Untick for entertainment, most motor vehicles, anything not for the business, or a bill
            that is not a valid tax invoice.
          </span>
        </span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle inline-flex items-center gap-1.5">
            <Paperclip className="size-3.5" strokeWidth={2} aria-hidden />
            Photo of the bill
          </span>
          <input
            ref={scanInput}
            type="file"
            accept="image/*,application/pdf"
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-semibold"
          />
          <span className="text-xs text-subtle">Keep it — the FTA wants the supplier&apos;s invoice for 5 years.</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-subtle">Note</span>
          <input name="notes" placeholder="optional — e.g. why it isn't claimable" className={inputCls} />
        </label>
      </div>
      <Feedback result={result} />
      <button type="submit" disabled={pending} className={btnCls}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Save className="size-4" strokeWidth={2} aria-hidden />
        )}
        Book the bill
      </button>
    </form>
  );
}
