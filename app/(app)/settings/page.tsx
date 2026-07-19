import { Settings2, Store } from "lucide-react";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { NegotiationToggle } from "@/components/negotiation-toggle";

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
              <div className="flex-1">
                <p className="text-sm font-semibold">Price negotiation</p>
                <p className="text-xs text-subtle">
                  Off = the AI holds at list price and never asks you to discount.
                </p>
              </div>
              <NegotiationToggle shopId={s.id} enabled={s.negotiation_enabled} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
