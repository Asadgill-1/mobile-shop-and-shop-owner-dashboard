"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_SHOP_COOKIE, assertShop, getScope } from "@/lib/scope";

/** Header shop switcher (owner only). "all" clears the pick → aggregate views. */
export async function setActiveShop(shopId: string): Promise<void> {
  const scope = await getScope();
  const store = await cookies();
  if (shopId === "all") {
    if (scope.role === "owner") store.delete(ACTIVE_SHOP_COOKIE);
  } else {
    assertShop(scope, shopId); // foreign/unknown shop → 404, same as the bots
    store.set(ACTIVE_SHOP_COOKIE, shopId, { path: "/", sameSite: "lax" });
  }
  revalidatePath("/", "layout");
}
