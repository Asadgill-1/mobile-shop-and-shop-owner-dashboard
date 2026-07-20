"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, SendHorizonal } from "lucide-react";
import { replyToCustomer, resolveEscalation } from "@/actions/chats";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

/** Reply composer + (when escalated) the "Return to AI" handover button. */
export function ChatReply({
  shopId,
  identity,
  escalated,
}: {
  shopId: string;
  identity: string;
  escalated: boolean;
}) {
  const router = useRouter();
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(
    replyToCustomer,
    null,
  );
  const [handingOver, startHandover] = useTransition();
  const [handoverError, setHandoverError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 max-w-2xl">
      {escalated ? (
        <div className="rounded-xl bg-warning-soft px-4 py-3 flex items-center gap-3 flex-wrap">
          <p className="text-sm font-semibold text-warning-text flex-1 min-w-40">
            This customer is waiting for a human — replies here go out in the shop&apos;s voice.
          </p>
          <button
            type="button"
            disabled={handingOver}
            onClick={() =>
              startHandover(async () => {
                setHandoverError(null);
                const res = await resolveEscalation(shopId, identity);
                if (!res.ok) setHandoverError(res.error ?? "Failed.");
                else router.refresh();
              })
            }
            className="pressable cursor-pointer inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 min-h-11 text-sm font-semibold disabled:opacity-60"
          >
            {handingOver ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <Bot className="size-4" strokeWidth={2} aria-hidden />
            )}
            Return to AI
          </button>
          {handoverError ? (
            <p className="w-full text-xs text-destructive-text">{handoverError}</p>
          ) : null}
        </div>
      ) : null}

      <form action={action} className="flex items-end gap-2">
        <input type="hidden" name="shop_id" value={shopId} />
        <input type="hidden" name="identity" value={identity} />
        <textarea
          name="text"
          rows={2}
          required
          maxLength={4000}
          placeholder="Reply to the customer…"
          className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-base placeholder:text-subtle resize-none"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Send reply"
          className="pressable cursor-pointer inline-flex items-center justify-center rounded-xl bg-primary text-primary-fg size-11 shrink-0 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-5 animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            <SendHorizonal className="size-5" strokeWidth={2} aria-hidden />
          )}
        </button>
      </form>
      <Feedback result={result} />
    </div>
  );
}
