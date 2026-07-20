import { Bike, CircleCheck, CircleSlash, Download, HandCoins } from "lucide-react";
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { fmtDubai } from "@/lib/period";
import { aed, num } from "@/lib/money";
import { riderCode, type CodLedgerRow, type RiderRow } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { AddRiderForm, ReconcileForm } from "@/components/rider-forms";

export default async function RidersPage() {
  const scope = await getScope();
  const ids = scopedShopIds(scope);

  const [ridersRes, ledgerRes] = await Promise.all([
    db.from("delivery_persons").select("*").in("shop_id", ids).order("created_at"),
    db
      .from("cod_ledger")
      .select("id,shop_id,rider_id,order_id,entry,amount,note,created_at")
      .in("shop_id", ids)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const riders = (ridersRes.data ?? []) as RiderRow[];
  const ledger = (ledgerRes.data ?? []) as CodLedgerRow[];

  // Balance per rider = Σcollect − Σhandover (riders/service.py cod_balance).
  const balance = new Map<string, number>();
  for (const row of ledger) {
    const delta = row.entry === "collect" ? num(row.amount) : -num(row.amount);
    balance.set(row.rider_id, (balance.get(row.rider_id) ?? 0) + delta);
  }
  const outstanding = [...balance.values()].reduce((a, b) => a + b, 0);

  const riderName = new Map(riders.map((r) => [r.id, r.name]));
  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));
  const multiShop = ids.length > 1;

  return (
    <>
      <PageHeader title="Riders & COD" sub={`${riders.length} rider${riders.length === 1 ? "" : "s"}`}>
        <a
          href="/riders/export?period=monthly"
          aria-label="Export rider deliveries CSV (this month)"
          className="pressable inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface text-sm font-semibold px-3.5 py-2.5 min-h-11"
        >
          <Download className="size-4" strokeWidth={2} aria-hidden />
          CSV
        </a>
        <AddRiderForm shops={scope.shops} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <StatCard
          label="COD outstanding"
          value={aed(outstanding)}
          icon={HandCoins}
          tone={outstanding > 0 ? "warning" : "accent"}
          hint="cash with riders"
        />
        <StatCard
          label="Linked riders"
          value={`${riders.filter((r) => r.telegram_id).length}/${riders.length}`}
          icon={Bike}
          tone="info"
          hint="connected on Telegram"
        />
      </div>

      {riders.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bike}
            title="No riders yet"
            hint="Riders are onboarded by the platform owner; each links themselves by pressing /start on the rider bot."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {riders.map((r) => {
            const bal = balance.get(r.id) ?? 0;
            return (
              <Card key={r.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{riderCode(r.rider_number)}</Badge>
                  {multiShop ? <Badge tone="neutral">{shopName.get(r.shop_id)}</Badge> : null}
                  <span className="ml-auto">
                    {r.telegram_id ? (
                      <Badge tone="accent">
                        <CircleCheck className="size-3.5" strokeWidth={2} aria-hidden /> Linked
                      </Badge>
                    ) : (
                      <Badge tone="neutral">
                        <CircleSlash className="size-3.5" strokeWidth={2} aria-hidden /> Not linked
                      </Badge>
                    )}
                  </span>
                </div>
                <p className="font-display font-semibold">{r.name}</p>
                <a href={`tel:${r.phone}`} className="text-sm text-subtle">
                  {r.phone}
                </a>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <p className="text-xs text-subtle">Holds</p>
                    <p
                      className={`font-display font-semibold tabular ${
                        bal > 0 ? "text-warning-text" : "text-accent-text"
                      }`}
                    >
                      {aed(bal)}
                    </p>
                  </div>
                  <ReconcileForm riderId={r.id} riderName={r.name} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle>COD ledger — latest entries</SectionTitle>
        <Card className="overflow-hidden">
          {ledger.length === 0 ? (
            <EmptyState
              icon={HandCoins}
              title="No COD entries yet"
              hint="Collections appear when riders deliver; handovers when cash is reconciled."
            />
          ) : (
            <ul className="divide-y divide-border">
              {ledger.slice(0, 20).map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                  <Badge tone={row.entry === "collect" ? "info" : "accent"}>
                    {row.entry === "collect" ? "Collected" : "Handed over"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{riderName.get(row.rider_id) ?? "Rider"}</p>
                    <p className="text-xs text-subtle truncate">{row.note ?? "—"}</p>
                  </div>
                  <p className={`font-semibold tabular ${row.entry === "collect" ? "" : "text-accent-text"}`}>
                    {row.entry === "collect" ? "+" : "−"}
                    {aed(row.amount)}
                  </p>
                  <p className="text-xs text-subtle w-24 text-right shrink-0">{fmtDubai(row.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
