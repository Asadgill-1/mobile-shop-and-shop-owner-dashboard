import { Bike, FileText, Handshake, KeyRound, Landmark, MessageCircle, Settings2, Store } from "lucide-react";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { NegotiationToggle } from "@/components/negotiation-toggle";
import { RiderDeliveryToggle } from "@/components/rider-delivery-toggle";
import { InvoiceIdentityForm } from "@/components/invoice-identity-form";
import { AssistantPersonaForm } from "@/components/assistant-persona-form";
import { HaggleAuthorityForm } from "@/components/haggle-authority-form";
import { ManagerPinForm } from "@/components/manager-pin-form";
import { VatProfileForm } from "@/components/vat-profile-form";

interface ShopSettingsRow {
  id: string;
  name: string;
  status: "active" | "suspended";
  whatsapp_number: string | null;
  negotiation_enabled: boolean;
  rider_keeps_delivery: boolean;
  trn: string | null;
  invoice_name: string | null;
  invoice_address: string | null;
  assistant_name: string | null;
  assistant_gender: string | null;
  assistant_style: string | null;
  haggle_ask_every_time: boolean;
  ai_max_discount_pct: number | string | null;
  emirate: string | null;
  vat_period: string;
  vat_quarter_anchor: number;
}

export default async function SettingsPage() {
  const scope = await getScope();

  // Every shop in scope, not just the switcher pick — settings are per shop.
  // Explicit column list: this table also carries bot tokens, which must never leave the server.
  // The PIN card is owner-only, so only an owner's page pays for the lookup. Which shops HAVE a PIN
  // is all that is read — the hash never leaves lib/override.ts.
  const [{ data }, pinsRes] = await Promise.all([
    db
      .from("shops")
      .select("id,name,status,whatsapp_number,negotiation_enabled,rider_keeps_delivery,trn,invoice_name,invoice_address,assistant_name,assistant_gender,assistant_style,haggle_ask_every_time,ai_max_discount_pct,emirate,vat_period,vat_quarter_anchor")
      .in("id", scope.shopIds)
      .order("created_at"),
    scope.role === "owner"
      ? db.from("manager_pins").select("shop_id").in("shop_id", scope.shopIds)
      : Promise.resolve({ data: [] as { shop_id: string }[] }),
  ]);
  const shops = (data ?? []) as ShopSettingsRow[];
  const hasPin = new Set((pinsRes.data ?? []).map((p) => p.shop_id));

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
            <details className="rounded-xl bg-muted px-3 py-2.5" open={!s.assistant_name}>
              <summary className="flex items-center gap-2 cursor-pointer list-none">
                <MessageCircle className="size-4 text-subtle shrink-0" strokeWidth={2} aria-hidden />
                <span className="text-sm font-semibold flex-1">Who answers customers</span>
                <Badge tone={s.assistant_name ? "accent" : "warning"}>
                  {s.assistant_name ?? "unnamed"}
                </Badge>
              </summary>
              <div className="pt-3">
                <AssistantPersonaForm
                  shopId={s.id}
                  name={s.assistant_name}
                  gender={s.assistant_gender}
                  style={s.assistant_style}
                />
              </div>
            </details>
            <details className="rounded-xl bg-muted px-3 py-2.5">
              <summary className="flex items-center gap-2 cursor-pointer list-none">
                <Handshake className="size-4 text-subtle shrink-0" strokeWidth={2} aria-hidden />
                <span className="text-sm font-semibold flex-1">Bargaining limit</span>
                <Badge tone={s.haggle_ask_every_time ? "warning" : "accent"}>
                  {s.haggle_ask_every_time
                    ? "you decide"
                    : `up to ${Number(s.ai_max_discount_pct ?? 0)}%`}
                </Badge>
              </summary>
              <div className="pt-3">
                <HaggleAuthorityForm
                  shopId={s.id}
                  askEveryTime={s.haggle_ask_every_time}
                  maxDiscountPct={Number(s.ai_max_discount_pct ?? 0)}
                />
              </div>
            </details>
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
              <Bike className="size-4 text-subtle" strokeWidth={2} aria-hidden />
              <div className="flex-1">
                <p className="text-sm font-semibold">Riders keep delivery fee</p>
                <p className="text-xs text-subtle">
                  On = the rider pockets the delivery charge. Off = all cash goes to the shop.
                </p>
              </div>
              <RiderDeliveryToggle shopId={s.id} enabled={s.rider_keeps_delivery} />
            </div>
            <details className="rounded-xl bg-muted px-3 py-2.5" open={!s.trn}>
              <summary className="flex items-center gap-2 cursor-pointer list-none">
                <FileText className="size-4 text-subtle shrink-0" strokeWidth={2} aria-hidden />
                <span className="text-sm font-semibold flex-1">Tax invoice details</span>
                {s.trn ? (
                  <Badge tone="accent">TRN set</Badge>
                ) : (
                  <Badge tone="warning">TRN missing</Badge>
                )}
              </summary>
              <div className="pt-3">
                <InvoiceIdentityForm
                  shopId={s.id}
                  trn={s.trn}
                  name={s.invoice_name}
                  address={s.invoice_address}
                />
              </div>
            </details>
            <details className="rounded-xl bg-muted px-3 py-2.5" open={!s.emirate}>
              <summary className="flex items-center gap-2 cursor-pointer list-none">
                <Landmark className="size-4 text-subtle shrink-0" strokeWidth={2} aria-hidden />
                <span className="text-sm font-semibold flex-1">VAT return details</span>
                {s.emirate ? (
                  <Badge tone="accent">{s.emirate}</Badge>
                ) : (
                  <Badge tone="warning">emirate missing</Badge>
                )}
              </summary>
              <div className="pt-3">
                <VatProfileForm
                  shopId={s.id}
                  emirate={s.emirate}
                  vatPeriod={s.vat_period}
                  quarterAnchor={s.vat_quarter_anchor}
                />
              </div>
            </details>
            {scope.role === "owner" ? (
              <details className="rounded-xl bg-muted px-3 py-2.5">
                <summary className="flex items-center gap-2 cursor-pointer list-none">
                  <KeyRound className="size-4 text-subtle shrink-0" strokeWidth={2} aria-hidden />
                  <span className="text-sm font-semibold flex-1">Manager PIN</span>
                  <Badge tone={hasPin.has(s.id) ? "accent" : "warning"}>
                    {hasPin.has(s.id) ? "set" : "not set"}
                  </Badge>
                </summary>
                <div className="pt-3">
                  <ManagerPinForm shopId={s.id} isSet={hasPin.has(s.id)} />
                </div>
              </details>
            ) : null}
          </Card>
        ))}
      </div>
    </>
  );
}
