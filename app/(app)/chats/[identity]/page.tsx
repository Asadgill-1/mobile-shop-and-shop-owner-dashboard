import Link from "next/link";
import { ArrowLeft, Bot, MessageSquare, User, UserCog } from "lucide-react";
import { db } from "@/lib/db";
import { assertShop, getScope } from "@/lib/scope";
import { fmtDubai } from "@/lib/period";
import type { MessageRow } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { RefreshPoll } from "@/components/refresh-poll";

export default async function TranscriptPage({
  params,
  searchParams,
}: {
  params: Promise<{ identity: string }>;
  searchParams: Promise<{ shop?: string }>;
}) {
  const [{ identity: rawIdentity }, { shop }, scope] = await Promise.all([
    params,
    searchParams,
    getScope(),
  ]);
  const identity = decodeURIComponent(rawIdentity);
  const shopId = assertShop(scope, shop); // foreign shop → 404

  const [msgRes, escRes] = await Promise.all([
    db
      .from("messages")
      .select("shop_id,identity,role,content,created_at")
      .eq("shop_id", shopId)
      .eq("identity", identity)
      .order("created_at", { ascending: false })
      .limit(60),
    db
      .from("pending_escalations")
      .select("id")
      .eq("shop_id", shopId)
      .eq("phone", identity)
      .is("resolved_at", null)
      .limit(1),
  ]);

  const messages = ((msgRes.data ?? []) as MessageRow[]).reverse();
  const isEscalated = (escRes.data ?? []).length > 0;
  const shopName = scope.shops.find((s) => s.id === shopId)?.name;

  return (
    <>
      <RefreshPoll seconds={10} />
      <div className="flex items-center gap-3">
        <Link
          href="/chats"
          aria-label="Back to chats"
          className="pressable rounded-xl border border-border bg-surface p-2.5 min-w-11 min-h-11 flex items-center justify-center"
        >
          <ArrowLeft className="size-5" strokeWidth={2} aria-hidden />
        </Link>
        <PageHeader title={identity} sub={shopName}>
          {isEscalated ? <Badge tone="warning">Needs human</Badge> : <Badge tone="accent">AI handling</Badge>}
        </PageHeader>
      </div>

      {isEscalated ? (
        <div
          role="status"
          className="rounded-xl bg-warning-soft text-warning-text text-sm font-semibold px-4 py-3"
        >
          This customer is waiting for a human. Reply from the keeper bot (/reply) — replying from
          the dashboard arrives in Phase 4.
        </div>
      ) : null}

      {messages.length === 0 ? (
        <Card>
          <EmptyState icon={MessageSquare} title="No messages saved" />
        </Card>
      ) : (
        <div className="flex flex-col gap-2 max-w-2xl">
          {messages.map((m, i) => {
            const mine = m.role !== "customer"; // shop side on the right
            const Icon = m.role === "customer" ? User : m.role === "assistant" ? Bot : UserCog;
            return (
              <div key={`${m.created_at}-${i}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${mine ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${
                      m.role === "customer"
                        ? "bg-surface border border-border rounded-bl-md"
                        : m.role === "assistant"
                          ? "bg-accent-soft text-foreground rounded-br-md"
                          : "bg-primary text-primary-fg rounded-br-md"
                    }`}
                  >
                    {m.content}
                  </div>
                  <p className="text-[11px] text-subtle flex items-center gap-1 px-1">
                    <Icon className="size-3" strokeWidth={2} aria-hidden />
                    {m.role === "customer" ? "Customer" : m.role === "assistant" ? "AI" : "Staff"} ·{" "}
                    {fmtDubai(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
