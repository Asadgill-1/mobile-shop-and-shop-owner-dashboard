import Link from "next/link";
import { MessageSquare, User } from "lucide-react";
import { db } from "@/lib/db";
import { getScope, scopedShopIds } from "@/lib/scope";
import { fmtDubai } from "@/lib/period";
import type { EscalationRow, MessageRow } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

interface Conversation {
  shopId: string;
  identity: string;
  preview: string;
  role: MessageRow["role"];
  lastAt: string;
  escalated: boolean;
}

export default async function ChatsPage() {
  const scope = await getScope();
  const ids = scopedShopIds(scope);

  // Python-side fold mirror (messaging/store.py conversations): newest 500 rows,
  // first occurrence per (shop, identity) wins.
  const [msgRes, escRes] = await Promise.all([
    db
      .from("messages")
      .select("shop_id,identity,role,content,created_at")
      .in("shop_id", ids)
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("pending_escalations")
      .select("shop_id,phone")
      .in("shop_id", ids)
      .is("resolved_at", null),
  ]);

  const escalated = new Set(
    ((escRes.data ?? []) as Pick<EscalationRow, "shop_id" | "phone">[]).map(
      (e) => `${e.shop_id}:${e.phone}`,
    ),
  );

  const seen = new Set<string>();
  const convs: Conversation[] = [];
  for (const m of (msgRes.data ?? []) as MessageRow[]) {
    const key = `${m.shop_id}:${m.identity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    convs.push({
      shopId: m.shop_id,
      identity: m.identity,
      preview: m.content,
      role: m.role,
      lastAt: m.created_at,
      escalated: escalated.has(key),
    });
    if (convs.length >= 30) break;
  }
  // Customers waiting for a human float to the top.
  convs.sort((a, b) => Number(b.escalated) - Number(a.escalated));

  const shopName = new Map(scope.shops.map((s) => [s.id, s.name]));
  const multiShop = ids.length > 1;
  const rolePrefix = { customer: "", assistant: "AI: ", shopkeeper: "Staff: " };

  return (
    <>
      <PageHeader
        title="Chats"
        sub="Telegram now — WhatsApp joins at Stage 13, same inbox"
      />
      {convs.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            hint="Customer chats with the AI assistant show up here as they happen."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {convs.map((c) => (
              <li key={`${c.shopId}:${c.identity}`}>
                <Link
                  href={`/chats/${encodeURIComponent(c.identity)}?shop=${c.shopId}`}
                  className="pressable flex items-center gap-3 px-4 py-3 hover:bg-muted"
                >
                  <div
                    className={`rounded-full p-2.5 shrink-0 ${
                      c.escalated ? "bg-warning-soft text-warning-text" : "bg-muted text-subtle"
                    }`}
                  >
                    <User className="size-5" strokeWidth={2} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{c.identity}</p>
                      {c.escalated ? <Badge tone="warning">Needs human</Badge> : null}
                      {multiShop ? <Badge tone="neutral">{shopName.get(c.shopId)}</Badge> : null}
                    </div>
                    <p className="text-sm text-subtle truncate">
                      {rolePrefix[c.role]}
                      {c.preview}
                    </p>
                  </div>
                  <p className="text-xs text-subtle shrink-0">{fmtDubai(c.lastAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
