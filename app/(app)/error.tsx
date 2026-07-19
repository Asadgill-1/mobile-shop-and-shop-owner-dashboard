"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-2xl bg-destructive-soft p-4">
        <TriangleAlert className="size-7 text-destructive-text" strokeWidth={2} aria-hidden />
      </div>
      <p className="font-display font-semibold text-lg">Something went wrong</p>
      <p className="text-sm text-subtle max-w-sm">
        The data couldn&apos;t be loaded. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="pressable cursor-pointer inline-flex items-center gap-2 rounded-xl bg-primary text-primary-fg font-semibold px-4 py-2.5 min-h-11 mt-2"
      >
        <RotateCcw className="size-4" strokeWidth={2} aria-hidden />
        Try again
      </button>
    </div>
  );
}
