"use client";

// The manager PIN prompt (migration 035). Appears only after the server has already refused the
// exact call once with needsPin — the browser never decides whether approval is needed, because it
// does not know the cost price, the floor or the shop's limits, and it is the thing being gated.
//
// Always the same shape: the prompt carries its own Approve button and hands the PIN back, and the
// caller repeats the call it already made. It is NEVER a field inside the form, because React 19
// resets an uncontrolled form once its action returns — a retry that re-read the fields would send
// the ORIGINAL values with the PIN attached. On the TRN that is a silent no-op (the new value is
// gone, so nothing differs, so nothing is gated and nothing changes) and it was live until a probe
// on 2026-08-01 caught it. usePinRetry below is what every form caller uses instead.
import { useEffect, useRef, useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import type { ActionResult } from "@/actions/orders";

/**
 * Run a FormData action so the PIN retry re-sends exactly what was submitted, not whatever the
 * form still shows. `submit` goes on the <form action>, `retry` on the prompt.
 */
export function usePinRetry(fn: (fd: FormData) => Promise<ActionResult>) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const sent = useRef<FormData | null>(null);

  const submit = (fd: FormData) => {
    sent.current = fd;
    start(async () => setResult(await fn(fd)));
  };
  return {
    result,
    pending,
    submit,
    retry: (pin: string) => {
      const fd = sent.current;
      if (!fd) return;
      fd.set("pin", pin);
      submit(fd);
    },
  };
}

export function PinPrompt({
  result,
  onSubmit,
  pending,
}: {
  result: ActionResult | null | undefined;
  onSubmit: (pin: string) => void;
  pending?: boolean;
}) {
  const [pin, setPin] = useState("");
  const need = !!result && !result.ok && !!result.needsPin;

  // Never leave a PIN sitting in a field once the prompt is answered or abandoned.
  useEffect(() => {
    if (!need) setPin("");
  }, [need]);

  if (!need || !result || result.ok) return null;

  return (
    <div className="rounded-xl border border-warning bg-warning-soft px-3 py-2.5 flex flex-col gap-2">
      <p className="flex items-start gap-2 text-xs font-semibold text-warning-text">
        <KeyRound className="size-4 shrink-0 mt-px" strokeWidth={2} aria-hidden />
        <span>{result.error}</span>
      </p>
      <div className="flex items-center gap-2">
        <input
          // type=password so the PIN is not on show to whoever is standing at the counter.
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pin) {
              e.preventDefault();
              onSubmit(pin);
            }
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Manager PIN"
          aria-label="Manager PIN"
          className="rounded-xl border border-border bg-background px-3.5 py-2 min-h-11 text-base tabular flex-1 min-w-0"
        />
        <button
          type="button"
          disabled={pending || !pin}
          onClick={() => onSubmit(pin)}
          className="pressable cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-warning text-white font-semibold px-3.5 py-2 min-h-11 text-sm disabled:opacity-60 shrink-0"
        >
          {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden /> : null}
          Approve
        </button>
      </div>
    </div>
  );
}
