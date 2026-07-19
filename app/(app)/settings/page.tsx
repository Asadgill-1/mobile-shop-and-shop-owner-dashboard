import { CircleCheck, CircleSlash, Settings2, Store } from "lucide-react";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";

interface ShopSettingsRow {
  id: string;
  name: string;
  status: "active" | "suspended";
  whatsapp_number: string | null;
  negotiation_enabled: boolean;
}

export default async function SettingsPage() {
  const scope = await getScope();

  // Every shop in scope, not just the switcher pick — settings are per shop.
  // Explicit column list: this table also carries bot tokens, which must never leave the server.
  const { data } = await db
    .from("shops")
    .select("id,name,status,whatsapp_number,negotiation_enabled")
    .in("id", scope.shopIds)
    .order("created_at");
  const shops = (data ?? []) as ShopSettingsRow[];

  return (
    <>
      <PageHeader title="Settings" sub={scope.email} />
      <SectionTitle>Shops</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {shops.map((s) => (
          <Card key={s.id} className="p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-accent-soft text-accent-text p-2.5">
                <Store className="size-5" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold truncate">{s.name}</p>
                <p className="text-xs text-subtle">{s.whatsapp_number ?? "no WhatsApp number"}</p>
              </div>
              <Badge tone={s.status === "active" ? "accent" : "destructive"}>{s.status}</Badge>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
              <Settings2 className="size-4 text-subtle" strokeWidth={2} aria-hidden />
              <p className="text-sm font-semibold flex-1">Price negotiation</p>
              {s.negotiation_enabled ? (
                <Badge tone="accent">
                  <CircleCheck className="size-3.5" strokeWidth={2} aria-hidden /> On
                </Badge>
              ) : (
                <Badge tone="neutral">
                  <CircleSlash className="size-3.5" strokeWidth={2} aria-hidden /> Off
                </Badge>
              )}
            </div>
            <p className="text-xs text-subtle">
              Toggle from the keeper bot (/negotiation on|off) — dashboard editing arrives in Phase 2.
            </p>
          </Card>
        ))}
      </div>
    </>
  );
}
