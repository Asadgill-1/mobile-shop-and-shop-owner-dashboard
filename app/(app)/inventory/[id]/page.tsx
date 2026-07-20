import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { productCode, type ProductRow } from "@/lib/types";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { ProductForm } from "@/components/product-form";
import { ProductTools } from "@/components/product-tools";
import { MediaManager, type MediaItem } from "@/components/media-manager";
import { UnitManager, type UnitItem } from "@/components/unit-manager";
import { OfferManager, type ActiveOffer, type GiftOption } from "@/components/offer-manager";

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, scope] = await Promise.all([params, getScope()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // Tenant guard in the query: foreign product == unknown product (404).
  const { data } = await db
    .from("products")
    .select("*")
    .eq("id", id)
    .in("shop_id", scope.shopIds)
    .maybeSingle();
  if (!data) notFound();
  const p = data as ProductRow;

  const images: MediaItem[] = [];
  if (p.images.length > 0) {
    const { data: signed } = await db.storage.from("shop-media").createSignedUrls(p.images, 3600);
    signed?.forEach((s, i) => {
      if (s.signedUrl) images.push({ path: p.images[i], url: s.signedUrl });
    });
  }

  const { data: unitRows } = await db
    .from("product_units")
    .select("id,imei,status,sold_at")
    .eq("product_id", p.id)
    .eq("shop_id", p.shop_id)
    .order("added_at");
  const units = (unitRows ?? []) as UnitItem[];
  const inStockUnits = units.filter((u) => u.status === "in_stock").length;
  // quantity is authoritative; the ledger drifting from it is worth a glance, not an error
  const unitMismatch = units.length > 0 && inStockUnits !== p.quantity;

  // Offers (023): the active one, plus this shop's other products as free-gift candidates.
  const [{ data: offerRow }, { data: giftRows }] = await Promise.all([
    db
      .from("offers")
      .select("id,type,label,value")
      .eq("product_id", p.id)
      .eq("active", true)
      .maybeSingle(),
    db
      .from("products")
      .select("id,product_number,brand,model")
      .eq("shop_id", p.shop_id)
      .neq("id", p.id)
      .order("brand"),
  ]);
  const offer = (offerRow ?? null) as ActiveOffer | null;
  const giftOptions: GiftOption[] = (giftRows ?? []).map((g) => ({
    id: g.id,
    label: `${productCode(g.product_number)} · ${g.brand} ${g.model}`,
  }));

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
        <PageHeader title={`${p.brand} ${p.model}`} sub={scope.shops.find((s) => s.id === p.shop_id)?.name}>
          <Badge tone="neutral">{productCode(p.product_number)}</Badge>
        </PageHeader>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card className="p-5 flex flex-col gap-4">
          <SectionTitle>Details</SectionTitle>
          <ProductForm
            mode="edit"
            defaults={{
              id: p.id,
              category: p.category,
              brand: p.brand,
              model: p.model,
              color: p.color,
              condition: p.condition,
              specs: p.specs,
              cost_price: p.cost_price,
              selling_price: p.selling_price,
              min_qty: p.min_qty,
              barcode: p.barcode,
            }}
          />
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="p-5 flex flex-col gap-4">
            <SectionTitle>Photos & video</SectionTitle>
            <MediaManager
              productId={p.id}
              images={images}
              video={p.video_url ? { path: p.video_url } : null}
            />
          </Card>
          <Card className="p-5 flex flex-col gap-4">
            <SectionTitle>Stock, boost & tags</SectionTitle>
            <ProductTools
              productId={p.id}
              boost={p.boost_level}
              tags={p.tags}
              featured={p.is_featured}
              quantity={p.quantity}
            />
          </Card>
          <Card className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <SectionTitle>IMEI units</SectionTitle>
              {unitMismatch ? (
                <Badge tone="warning">
                  {inStockUnits} IMEI ≠ {p.quantity} stock
                </Badge>
              ) : units.length > 0 ? (
                <Badge tone="accent">{inStockUnits} in stock</Badge>
              ) : null}
            </div>
            <UnitManager productId={p.id} units={units} />
          </Card>
          <Card className="p-5 flex flex-col gap-4">
            <SectionTitle>Offer</SectionTitle>
            <OfferManager productId={p.id} offer={offer} giftOptions={giftOptions} />
          </Card>
        </div>
      </div>
    </>
  );
}
