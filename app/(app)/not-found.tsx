import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-2xl bg-muted p-4">
        <SearchX className="size-7 text-subtle" strokeWidth={2} aria-hidden />
      </div>
      <p className="font-display font-semibold text-lg">Not found</p>
      <p className="text-sm text-subtle max-w-sm">
        This item doesn&apos;t exist, or it belongs to another shop.
      </p>
      <Link
        href="/"
        className="pressable inline-flex items-center gap-2 rounded-xl bg-primary text-primary-fg font-semibold px-4 py-2.5 min-h-11 mt-2"
      >
        Back to Home
      </Link>
    </div>
  );
}
