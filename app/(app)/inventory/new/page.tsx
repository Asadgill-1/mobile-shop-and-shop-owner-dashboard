import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getScope } from "@/lib/scope";
import { Card, PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/product-form";

export default async function NewProductPage() {
  const scope = await getScope();
  const defaultShop = scope.activeShopId ?? scope.shops[0].id;

  return (
    <>
      <div className="flex items-center gap-3">
        <Link
          href="/inventory"
          aria-label="Back to inventory"
          className="pressable rounded-xl border border-border bg-surface p-2.5 min-w-11 min-h-11 flex items-center justify-center"
        >
          <ArrowLeft className="size-5" strokeWidth={2} aria-hidden />
        </Link>
        <PageHeader title="Add product" sub="Photos can be added right after saving" />
      </div>
      <Card className="p-5 max-w-2xl">
        <ProductForm mode="create" shops={scope.shops} shopId={defaultShop} />
      </Card>
    </>
  );
}
