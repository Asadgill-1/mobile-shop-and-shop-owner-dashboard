"use client";

import { useActionState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { signIn, type AuthState } from "@/actions/auth";

const initial: AuthState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);

  return (
    <form action={action} className="bg-surface border border-border rounded-2xl shadow-card p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-semibold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@shop.com"
          className="rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base placeholder:text-subtle"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-semibold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-xl border border-border bg-background px-3.5 py-2.5 min-h-11 text-base"
        />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-destructive-soft text-destructive-text text-sm font-semibold px-4 py-3">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="pressable cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-fg font-display font-semibold px-4 py-3 min-h-12 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <LogIn className="size-5" strokeWidth={2} aria-hidden />
        )}
        Sign in
      </button>
      <p className="text-xs text-subtle text-center">
        No self-signup — accounts are created by the platform owner.
      </p>
    </form>
  );
}
