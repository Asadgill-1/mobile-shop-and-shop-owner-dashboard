"use client";

import type { ActionResult } from "@/actions/orders";

/** Inline result line under an action cluster: error red, success green-flash. */
export function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  if (!result.ok) {
    // "Fetch a manager" is a request, not a failure — PinPrompt renders that reason itself, in
    // amber, above its own field. Showing it here too would say it twice and say it in red.
    if (result.needsPin) return null;
    return (
      <p role="alert" className="rounded-lg bg-destructive-soft text-destructive-text text-xs font-semibold px-3 py-2">
        {result.error}
      </p>
    );
  }
  if (!result.message) return null;
  return (
    <p role="status" className="flash-ok rounded-lg bg-accent-soft text-accent-text text-xs font-semibold px-3 py-2">
      {result.message}
    </p>
  );
}
