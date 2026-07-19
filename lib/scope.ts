// SHARED with owner-dashboard-mobile — edit both (PLAN §3.4)
// Tenant guard. Every RSC and server action starts here (PLAN §3.2).
// keeper → exactly one shop; owner → every shop of their client, plus an
// active-shop cookie for the header switcher ("all" = aggregate views).
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "./db";
import { supabaseAuth } from "./supabase-auth";

export const ACTIVE_SHOP_COOKIE = "active_shop";

export interface ShopRef {
  id: string;
  name: string;
}

export interface Scope {
  role: "keeper" | "owner";
  email: string;
  clientId: string | null;
  /** Every shop this login may see (keeper: exactly one). */
  shops: ShopRef[];
  shopIds: string[];
  /** The switcher selection; null = "All shops" (owner only). */
  activeShopId: string | null;
}

/**
 * Resolve the logged-in user to their tenant scope. Redirects to /login when
 * signed out or not provisioned in dashboard_users. Cached per request.
 */
export const getScope = cache(async (): Promise<Scope> => {
  const supabase = await supabaseAuth();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: du } = await db
    .from("dashboard_users")
    .select("role,shop_id,client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!du) redirect("/login?error=noaccess");

  let shops: ShopRef[] = [];
  let clientId: string | null = null;

  if (du.role === "keeper" && du.shop_id) {
    const { data } = await db.from("shops").select("id,name").eq("id", du.shop_id);
    shops = data ?? [];
  } else if (du.role === "owner" && du.client_id) {
    clientId = du.client_id;
    const { data } = await db
      .from("shops")
      .select("id,name")
      .eq("client_id", du.client_id)
      .order("created_at");
    shops = data ?? [];
  }
  if (shops.length === 0) redirect("/login?error=noaccess");

  const shopIds = shops.map((s) => s.id);

  let activeShopId: string | null = shops[0].id;
  if (du.role === "owner") {
    const picked = (await cookies()).get(ACTIVE_SHOP_COOKIE)?.value;
    activeShopId = picked && shopIds.includes(picked) ? picked : null; // null = All shops
  }

  return { role: du.role, email: user.email ?? "", clientId, shops, shopIds, activeShopId };
});

/** Shop ids the current view should query: the active shop, or all in scope. */
export function scopedShopIds(scope: Scope): string[] {
  return scope.activeShopId ? [scope.activeShopId] : scope.shopIds;
}

/**
 * Mirror of the bot's _own_shop guard: an unknown shop and a foreign shop are
 * the identical 404 — never confirm another tenant's resource exists.
 */
export function assertShop(scope: Scope, shopId: string | null | undefined): string {
  if (!shopId || !scope.shopIds.includes(shopId)) notFound();
  return shopId;
}
