"use client";

import { useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { setActiveShop } from "@/actions/shop";
import type { ShopRef } from "@/lib/scope";

/** Owner-only header control: pick one shop or "All shops" (PLAN §4). */
export function ShopSwitcher({
  shops,
  activeShopId,
}: {
  shops: ShopRef[];
  activeShopId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative">
      <select
        aria-label="Active shop"
        value={activeShopId ?? "all"}
        disabled={pending}
        onChange={(e) => startTransition(() => setActiveShop(e.target.value))}
        className={`pressable cursor-pointer appearance-none rounded-xl border border-border bg-surface pl-3 pr-9 py-2.5 text-sm font-semibold min-h-11 ${
          pending ? "opacity-60" : ""
        }`}
      >
        <option value="all">All shops</option>
        {shops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-subtle"
        strokeWidth={2}
        aria-hidden
      />
    </div>
  );
}
