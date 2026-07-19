"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ReceiptText,
  Package,
  Calculator,
  FileText,
  MessageSquare,
  Bike,
  ChartColumn,
  Settings,
  Menu,
  X,
  LogOut,
  Store,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/actions/auth";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

function items(draftCount: number, escalationCount: number): Item[] {
  return [
    { href: "/", label: "Home", icon: Home },
    { href: "/orders", label: "Orders", icon: ReceiptText, badge: draftCount },
    { href: "/inventory", label: "Inventory", icon: Package },
    { href: "/pos", label: "POS", icon: Calculator },
    { href: "/invoices", label: "Invoices", icon: FileText },
    { href: "/chats", label: "Chats", icon: MessageSquare, badge: escalationCount },
    { href: "/riders", label: "Riders & COD", icon: Bike },
    { href: "/reports", label: "Reports", icon: ChartColumn },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function CountBadge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center rounded-full bg-accent text-accent-fg text-xs font-bold min-w-5 h-5 px-1.5">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Desktop sidebar (≥lg) + mobile bottom bar with a More sheet (<lg). PLAN §4. */
export function Nav({
  shopLabel,
  draftCount,
  escalationCount,
}: {
  shopLabel: string;
  draftCount: number;
  escalationCount: number;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const all = items(draftCount, escalationCount);
  const bottom = all.slice(0, 4); // Home · Orders · Inventory · POS
  const more = all.slice(4); //     Chats · Riders · Reports · Settings
  const moreBadge = more.reduce((n, item) => n + (item.badge ?? 0), 0);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col gap-1 border-r border-border bg-surface p-3 sticky top-0 h-dvh">
        <div className="flex items-center gap-2.5 px-2 py-3 mb-2">
          <div className="rounded-xl bg-accent p-2">
            <Store className="size-5 text-accent-fg" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-display font-semibold leading-tight">Shop Dashboard</p>
            <p className="text-xs text-subtle truncate">{shopLabel}</p>
          </div>
        </div>
        {all.map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`pressable flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                active
                  ? "bg-primary text-primary-fg"
                  : "text-subtle hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-5 shrink-0" strokeWidth={2} aria-hidden />
              <span>{label}</span>
              <CountBadge n={badge} />
            </Link>
          );
        })}
        <form action={signOut} className="mt-auto">
          <button
            type="submit"
            className="pressable cursor-pointer flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-subtle hover:bg-destructive-soft hover:text-destructive-text"
          >
            <LogOut className="size-5" strokeWidth={2} aria-hidden />
            Sign out
          </button>
        </form>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5">
          {bottom.map(({ href, label, icon: Icon, badge }) => {
            const active = isActive(pathname, href) && !moreOpen;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`pressable relative flex flex-col items-center gap-0.5 py-2 min-h-14 justify-center text-[11px] font-semibold ${
                  active ? "text-accent-text" : "text-subtle"
                }`}
              >
                {active ? (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" aria-hidden />
                ) : null}
                <span className="relative">
                  <Icon className="size-5" strokeWidth={2} aria-hidden />
                  {badge ? (
                    <span className="absolute -top-1.5 -right-2 rounded-full bg-accent text-accent-fg text-[10px] font-bold min-w-4 h-4 px-1 inline-flex items-center justify-center">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </span>
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={`pressable cursor-pointer relative flex flex-col items-center gap-0.5 py-2 min-h-14 justify-center text-[11px] font-semibold ${
              moreOpen ? "text-accent-text" : "text-subtle"
            }`}
          >
            <span className="relative">
              {moreOpen ? (
                <X className="size-5" strokeWidth={2} aria-hidden />
              ) : (
                <Menu className="size-5" strokeWidth={2} aria-hidden />
              )}
              {!moreOpen && moreBadge ? (
                <span className="absolute -top-1 -right-1 size-2 rounded-full bg-accent" aria-hidden />
              ) : null}
            </span>
            More
          </button>
        </div>
      </nav>

      {/* More sheet */}
      {moreOpen ? (
        <div className="lg:hidden fixed inset-0 z-30" role="dialog" aria-label="More navigation">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute bottom-14 inset-x-0 rounded-t-2xl border-t border-border bg-surface p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-2xl">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden />
            {more.map(({ href, label, icon: Icon, badge }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className={`pressable flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${
                  isActive(pathname, href)
                    ? "bg-primary text-primary-fg"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="size-5" strokeWidth={2} aria-hidden />
                {label}
                <CountBadge n={badge} />
              </Link>
            ))}
            <form action={signOut}>
              <button
                type="submit"
                className="pressable cursor-pointer flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-destructive-text hover:bg-destructive-soft"
              >
                <LogOut className="size-5" strokeWidth={2} aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
