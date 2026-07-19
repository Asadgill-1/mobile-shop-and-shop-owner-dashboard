"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Bike, Loader2, OctagonX } from "lucide-react";
import {
  advanceDelivery,
  assignDelivery,
  cancelOrder,
  type ActionResult,
} from "@/actions/orders";
import { Feedback } from "./action-feedback";

const NEXT: Record<string, string> = { confirmed: "packed", packed: "shipped", shipped: "delivered" };
const ASSIGNABLE = ["confirmed", "packed", "shipped"];

export interface RiderOption {
  id: string;
  name: string;
  linked: boolean;
}

/** Order-detail actions: advance one step, assign a rider, cancel with remarks. */
export function DeliveryActions({
  orderId,
  status,
  riders,
  currentRiderId,
}: {
  orderId: string;
  status: string;
  riders: RiderOption[];
  currentRiderId: string | null;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [riderId, setRiderId] = useState(currentRiderId ?? "");
  const [pending, startTransition] = useTransition();

  const next = NEXT[status];
  const canAssign = ASSIGNABLE.includes(status);
  const canCancel = status !== "cancelled" && status !== "delivered" && status !== "draft";
  if (!next && !canAssign && !canCancel) return null;

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => setResult(await fn()));

  return (
    <div className="flex flex-col gap-3">
      {next ? (
        <button
          type="button"
          onClick={() => run(() => advanceDelivery(orderId, next))}
          disabled={pending}
          className="pressable cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-fg font-semibold px-4 py-2.5 min-h-11 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
          )}
          Mark as {next}
        </button>
      ) : null}

      {canAssign && riders.length > 0 ? (
        <form
          action={(fd) => run(() => assignDelivery(orderId, fd))}
          className="flex gap-2"
        >
          <select
            name="rider_id"
            value={riderId}
            onChange={(e) => setRiderId(e.target.value)}
            aria-label="Rider"
            className="flex-1 min-w-0 rounded-xl border border-border bg-surface px-3 py-2.5 min-h-11 text-sm cursor-pointer"
          >
            <option value="" disabled>
              Pick a rider…
            </option>
            {riders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.linked ? "" : " (not on Telegram yet)"}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending || !riderId}
            className="pressable cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-info text-white text-sm font-semibold px-3.5 min-h-11 disabled:opacity-60"
          >
            <Bike className="size-4" strokeWidth={2} aria-hidden />
            {currentRiderId ? "Reassign" : "Assign"}
          </button>
        </form>
      ) : null}

      {canCancel ? (
        !cancelling ? (
          <button
            type="button"
            onClick={() => setCancelling(true)}
            className="pressable cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl border border-border text-destructive-text text-sm font-semibold px-4 py-2.5 min-h-11"
          >
            <OctagonX className="size-4" strokeWidth={2} aria-hidden />
            Cancel order
          </button>
        ) : (
          <form action={(fd) => run(() => cancelOrder(orderId, fd))} className="flex gap-2">
            <input
              name="remarks"
              placeholder="Why? (mandatory — owner sees this)"
              autoFocus
              className="flex-1 min-w-0 rounded-xl border border-border bg-background px-3 py-2 min-h-11 text-sm"
            />
            <button
              type="submit"
              disabled={pending}
              className="pressable cursor-pointer rounded-xl bg-destructive text-white text-sm font-semibold px-3 min-h-11 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden /> : "Cancel it"}
            </button>
            <button
              type="button"
              onClick={() => setCancelling(false)}
              className="pressable cursor-pointer rounded-xl border border-border text-sm font-semibold px-3 min-h-11"
            >
              Back
            </button>
          </form>
        )
      ) : null}
      <Feedback result={result} />
    </div>
  );
}
