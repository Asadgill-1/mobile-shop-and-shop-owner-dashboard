// VAT vocabulary and the two judgement calls that come with it (migration 036).
//
// Zero imports on purpose: `node --test lib/vat.test.ts` resolves raw ESM, and one extensionless
// import of ./db drags in server-only + the whole Supabase client. Same split as override-rules.ts.

/** VAT201 reports standard-rated supplies per emirate (boxes 1a–1g), so the shop must name one. */
export const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
] as const;
export type Emirate = (typeof EMIRATES)[number];

export type VatTreatment =
  | "standard"
  | "zero_rated"
  | "exempt"
  | "reverse_charge"
  | "out_of_scope";

/** The word list shared by invoices.vat_treatment and purchase_invoices.vat_treatment. */
export const VAT_TREATMENTS: { value: VatTreatment; label: string; hint: string }[] = [
  { value: "standard", label: "Standard 5%", hint: "Ordinary UAE supply." },
  { value: "zero_rated", label: "Zero-rated 0%", hint: "Exports, some medicine, first-supply property." },
  { value: "exempt", label: "Exempt", hint: "Bare land, local passenger transport, some financial services." },
  { value: "reverse_charge", label: "Reverse charge", hint: "Imported goods or services — the same figure lands on both sides of the return." },
  { value: "out_of_scope", label: "Out of scope", hint: "No UAE VAT applies at all." },
];

const TREATMENT_LABEL = new Map(VAT_TREATMENTS.map((t) => [t.value, t.label]));
export function treatmentLabel(value: string): string {
  return TREATMENT_LABEL.get(value as VatTreatment) ?? value;
}

export type VatPeriod = "monthly" | "quarterly";

/** The FTA staggers quarterly filers; the anchor says which cycle this shop is on. */
export const QUARTER_ANCHORS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: "Jan · Apr · Jul · Oct" },
  { value: 2, label: "Feb · May · Aug · Nov" },
  { value: 3, label: "Mar · Jun · Sep · Dec" },
];

export const VAT_RATE = 0.05;

/** How far the booked VAT may sit from 5% of the net before it is worth a second look. */
export const VAT_TOLERANCE = 0.02;

/** A UAE TRN is 15 digits. Empty is allowed — a cash purchase from an unregistered trader has none,
 *  and refusing to book it would just mean it never gets booked. */
export function trnError(trn: string): string | null {
  const t = trn.trim();
  if (!t) return null;
  return /^\d{15}$/.test(t) ? null : "A UAE TRN is 15 digits.";
}

/**
 * A WARNING, never a refusal (migration 036's header says why).
 *
 * Supplier invoices round per line and then total, so a true bill lands a fil or two off 5% of its
 * own net; partly-exempt bills are legitimately far off. Blocking those would force whoever is
 * booking to retype the paper until the form accepts it — which is how wrong numbers get filed.
 * Only 'standard' is checked: zero-rated and exempt carry no VAT by definition, and a reverse-charge
 * bill carries none from the supplier because the buyer accounts for it.
 */
export function vatVarianceWarning(
  subtotal: number,
  vat: number,
  treatment: VatTreatment,
): string | null {
  if (treatment !== "standard") {
    return vat > 0
      ? `${treatmentLabel(treatment)} supplies carry no supplier VAT — check the ${vat.toFixed(2)} you entered.`
      : null;
  }
  const expected = Math.round(subtotal * VAT_RATE * 100) / 100;
  const off = Math.round(Math.abs(vat - expected) * 100) / 100;
  if (off <= VAT_TOLERANCE) return null;
  return `VAT ${vat.toFixed(2)} is ${off.toFixed(2)} off 5% of ${subtotal.toFixed(2)} (${expected.toFixed(2)}). Booked as entered — check the bill.`;
}

/** Input VAT is only claimable against a valid tax invoice, and that means the supplier's TRN. */
export function recoverableWarning(recoverable: boolean, supplierTrn: string): string | null {
  if (!recoverable || supplierTrn.trim()) return null;
  return "Marked recoverable, but this bill has no supplier TRN — the FTA disallows the claim without one.";
}
