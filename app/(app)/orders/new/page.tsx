import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { aed } from "@/lib/money";
import { productCode } from "@/lib/types";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { OrderForm, type ProductOption } from "@/components/order-form";

export default async function NewOrderPage() {
  const scope = await getScope();
  // A manual order belongs to ONE shop: the switcher pick, or the keeper's only shop.
  const shopId = scope.activeShopId ?? (scope.shops.length === 1 ? scope.shops[0].id : null);

  if (!shopId) {
    return (
      <>
        <PageHeader title="New order" />
        <Card>
          <EmptyState
            icon={Store}
            title="Pick a shop first"
            hint="Use the shop switcher in the header to choose which shop this order belongs to."
          />
        </Card>
      </>
    );
  }

  const { data } = await db
    .from("products")
    .select("id,product_number,brand,model,color,selling_price,quantity")
    .eq("shop_id", shopId)
    .gt("quantity", 0)
    .order("brand");
  const products: ProductOption[] = (data ?? []).map((p) => ({
    id: p.id,
    code: productCode(p.product_number),
    name: `${p.brand} ${p.model}${p.color ? ` ${p.color}` : ""}`,
    qty: p.quantity,
    price: aed(p.selling_price),
  }));

  return (
    <>
      <div className="flex items-center gap-3">
        <Link
          href="/orders"
          aria-label="Back to orders"
          className="pressable rounded-xl border border-border bg-surface p-2.5 min-w-11 min-h-11 flex items-center justify-center"
        >
          <ArrowLeft className="size-5" strokeWidth={2} aria-hidden />
        </Link>
        <PageHeader
          title="New order"
          sub={scope.shops.find((s) => s.id === shopId)?.name}
        />
      </div>
      {products.length === 0 ? (
        <Card>
          <EmptyState icon={Store} title="No products in stock" hint="Add stock in Inventory first." />
        </Card>
      ) : (
        <Card className="p-5">
          <OrderForm shopId={shopId} products={products} />
        </Card>
      )}
    </>
  );
}
