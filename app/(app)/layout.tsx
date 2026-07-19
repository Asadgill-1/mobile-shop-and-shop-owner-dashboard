import { Store } from "lucide-react";
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { Nav } from "@/components/nav";
import { ShopSwitcher } from "@/components/shop-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const scope = await getScope();
  const ids = scopedShopIds(scope);

  // Nav badges: pending drafts + open escalations for the shops in view (PLAN §4).
  const [draftsRes, escRes] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).in("shop_id", ids).eq("status", "draft"),
    db
      .from("pending_escalations")
      .select("id", { count: "exact", head: true })
      .in("shop_id", ids)
      .is("resolved_at", null),
  ]);

  const shopLabel = scope.activeShopId
    ? scope.shops.find((s) => s.id === scope.activeShopId)?.name ?? "Shop"
    : "All shops";

  return (
    <div className="flex-1 flex min-h-dvh">
      <Nav
        shopLabel={shopLabel}
        draftCount={draftsRes.count ?? 0}
        escalationCount={escRes.count ?? 0}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 border-b border-border bg-surface">
          <div className="flex items-center gap-3 px-4 lg:px-6 h-14">
            <div className="lg:hidden flex items-center gap-2 min-w-0">
              <div className="rounded-lg bg-accent p-1.5">
                <Store className="size-4 text-accent-fg" strokeWidth={2} aria-hidden />
              </div>
              <p className="font-display font-semibold truncate">{shopLabel}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {scope.role === "owner" ? (
                <ShopSwitcher shops={scope.shops} activeShopId={scope.activeShopId} />
              ) : (
                <p className="hidden lg:block text-sm font-semibold text-subtle">{scope.email}</p>
              )}
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="flex-1 w-full max-w-screen-xl mx-auto p-4 lg:p-6 pb-24 lg:pb-8 flex flex-col gap-5">
          {children}
        </main>
      </div>
    </div>
  );
}
