"use client";

// Who the customer thinks they are talking to (migration 027). The gender field is grammatical,
// not cosmetic: Hindi, Urdu and Arabic conjugate verbs by the speaker's gender, and most
// customers here write in romanised Hindi/Urdu — a "Sara" using masculine forms gives the game
// away instantly.
import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";
import { setAssistantPersona } from "@/actions/settings";
import type { ActionResult } from "@/actions/orders";
import { Feedback } from "./action-feedback";

const inputCls =
  "rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle";

export function AssistantPersonaForm({
  shopId,
  name,
  gender,
  style,
}: {
  shopId: string;
  name: string | null;
  gender: string | null;
  style: string | null;
}) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(
    setAssistantPersona,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="shop_id" value={shopId} />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">Name customers see</span>
        <input
          name="assistant_name"
          defaultValue={name ?? ""}
          placeholder="Sara"
          maxLength={40}
          className={inputCls}
        />
        <span className="text-xs text-subtle">Leave empty to just speak as the shop.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">Speaks as</span>
        <select name="assistant_gender" defaultValue={gender ?? ""} className={inputCls}>
          <option value="">Not set</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>
        <span className="text-xs text-subtle">
          Hindi, Urdu and Arabic change the verb endings, so this keeps the replies natural.
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-subtle">How they should sound</span>
        <input
          name="assistant_style"
          defaultValue={style ?? ""}
          placeholder="friendly, quick replies, calls people bro"
          maxLength={200}
          className={inputCls}
        />
        <span className="text-xs text-subtle">
          Tone only. Prices, stock and the rules never change.
        </span>
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
        Save assistant
      </button>
    </form>
  );
}
