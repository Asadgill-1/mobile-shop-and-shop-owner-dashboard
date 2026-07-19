import Link from "next/link";
import { ImageOff, Package, Plus, Star, Video } from "lucide-react";
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { aed } from "@/lib/money";
import { isLowStock, productCode, type ProductRow } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

const CATEGORIES = ["Mobile", "Laptop", "Tablet", "Accessory"] as const;

interface Params {
  cat?: string;
  q?: string;
  low?: string;
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [{ cat, q, low }, scope] = await Promise.all([searchParams, getScope()]);
  const ids = scopedShopIds(scope);

  let query = db
    .from("products")
    .select(
      "id,shop_id,product_number,category,brand,model,color,condition,selling_price,cost_price,quantity,min_qty,images,video_url,boost_level,tags,is_featured",
    )
    .in("shop_id", ids)
    .order("boost_level", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (cat && (CATEGORIES as readonly string[]).includes(cat)) query = query.eq("category", cat);
  const term = (q ?? "").trim().replace(/[,()%]/g, " ").trim();
  if (term) query = query.or(`brand.ilike.%${term}%,model.ilike.%${term}%`);

  const { data } = await query;
  let products = (data ?? []) as unknown as ProductRow[];
  if (low === "1") products = products.filter(isLowStock);

  // First image of each product → 1h signed URL (private bucket, PLAN §5.3).
  const paths = products.map((p) => p.images?.[0]).filter(Boolean) as string[];
  const thumb = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await db.storage.from("shop-media").createSignedUrls(paths, 3600);
    signed?.forEach((s, i) => {
      if (s.signedUrl) thumb.set(paths[i], s.signedUrl);
    });
  }

  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));
  const multiShop = ids.length > 1;
  const units = products.reduce((n, p) => n + p.quantity, 0);

  return (
    <>
      <PageHeader
        title="Inventory"
        sub={`${products.length} product${products.length === 1 ? "" : "s"} · ${units} unit${units === 1 ? "" : "s"} in stock`}
      >
        <Link
          href="/inventory/new"
          className="pressable inline-flex items-center gap-1.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold px-4 py-2.5 min-h-11"
        >
          <Plus className="size-4" strokeWidth={2} aria-hidden />
          Add product
        </Link>
      </PageHeader>

      <form className="flex flex-wrap gap-2" action="/inventory" method="get">
        {cat ? <input type="hidden" name="cat" value={cat} /> : null}
        {low ? <input type="hidden" name="low" value={low} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search brand or model"
          aria-label="Search products"
          className="flex-1 min-w-52 rounded-xl border border-border bg-surface px-3.5 py-2.5 min-h-11 text-sm"
        />
        <button
          type="submit"
          className="pressable cursor-pointer rounded-xl bg-primary text-primary-fg text-sm font-semibold px-4 min-h-11"
        >
          Search
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        <Chip href="/inventory" active={!cat && low !== "1"}>
          All
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} href={`/inventory?cat=${c}`} active={cat === c}>
            {c}
          </Chip>
        ))}
        <Chip href="/inventory?low=1" active={low === "1"}>
          Low stock
        </Chip>
      </div>

      {products.length === 0 ? (
        <Card>
          <EmptyState
            icon={Package}
            title="No products found"
            hint="Products are added from the keeper bot's /addproduct — the dashboard form arrives in Phase 2."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {products.map((p) => {
            const img = p.images?.[0] ? thumb.get(p.images[0]) : undefined;
            const lowStock = isLowStock(p);
            return (
              <Link key={p.id} href={`/inventory/${p.id}`} className="pressable block">
                <Card className="overflow-hidden flex flex-col h-full hover:border-accent">
                <div className="relative aspect-[4/3] bg-muted flex items-center justify-center">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URLs expire; next/image caching would break them
                    <img
                      src={img}
                      alt={`${p.brand} ${p.model}`}
                      className="absolute inset-0 size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <ImageOff className="size-7 text-subtle" strokeWidth={2} aria-hidden />
                  )}
                  <div className="absolute top-2 left-2 flex gap-1">
                    {p.is_featured ? (
                      <span className="rounded-lg bg-warning text-white p-1" title="Featured">
                        <Star className="size-3.5" strokeWidth={2} aria-hidden />
                      </span>
                    ) : null}
                    {p.video_url ? (
                      <span className="rounded-lg bg-black/60 text-white p-1" title="Has video">
                        <Video className="size-3.5" strokeWidth={2} aria-hidden />
                      </span>
                    ) : null}
                  </div>
                  <span className="absolute bottom-2 right-2">
                    <Badge tone={p.quantity === 0 ? "destructive" : lowStock ? "warning" : "accent"}>
                      {p.quantity === 0 ? "Out" : `${p.quantity} in stock`}
                    </Badge>
                  </span>
                </div>
                <div className="p-3 flex flex-col gap-1.5 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-subtle">
                    <span className="font-semibold">{productCode(p.product_number)}</span>
                    <span>·</span>
                    <span>{p.condition}</span>
                    {multiShop ? (
                      <span className="truncate">· {shopName.get(p.shop_id)}</span>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold leading-snug">
                    {p.brand} {p.model}
                    {p.color ? <span className="text-subtle font-normal"> · {p.color}</span> : null}
                  </p>
                  <div className="mt-auto flex items-baseline gap-2">
                    <p className="font-display font-semibold tabular">{aed(p.selling_price)}</p>
                    <p className="text-xs text-subtle tabular">cost {aed(p.cost_price)}</p>
                  </div>
                  {p.boost_level > 0 || p.tags.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {p.boost_level > 0 ? <Badge tone="violet">boost {p.boost_level}</Badge> : null}
                      {p.tags.slice(0, 2).map((t) => (
                        <Badge key={t} tone="neutral">
                          {t.replace(/_/g, " ")}
                        </Badge>
                      ))}
                      {p.tags.length > 2 ? <Badge tone="neutral">+{p.tags.length - 2}</Badge> : null}
                    </div>
                  ) : null}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`pressable inline-flex items-center rounded-full px-3.5 py-2 min-h-10 text-xs font-semibold whitespace-nowrap ${
        active ? "bg-accent text-accent-fg" : "bg-surface border border-border text-subtle"
      }`}
    >
      {children}
    </Link>
  );
}
