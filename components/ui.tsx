// Presentational primitives — server-component friendly (no hooks, no state).
import type { LucideIcon } from "lucide-react";
import type { OrderStatus } from "@/lib/types";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-surface border border-border rounded-2xl shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {sub ? <p className="text-sm text-subtle mt-0.5">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

type Tone = "accent" | "destructive" | "warning" | "info" | "violet" | "neutral";

const toneSoft: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-text",
  destructive: "bg-destructive-soft text-destructive-text",
  warning: "bg-warning-soft text-warning-text",
  info: "bg-info-soft text-info-text",
  violet: "bg-violet-soft text-violet-text",
  neutral: "bg-muted text-subtle",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${toneSoft[tone]}`}
    >
      {children}
    </span>
  );
}

const statusTone: Record<OrderStatus, Tone> = {
  draft: "warning",
  pending: "neutral",
  confirmed: "info",
  packed: "violet",
  shipped: "info",
  delivered: "accent",
  cancelled: "destructive",
};

const statusLabel: Record<OrderStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  return <Badge tone={statusTone[status] ?? "neutral"}>{statusLabel[status] ?? status}</Badge>;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <Card className="p-4 flex items-start gap-3">
      <div className={`rounded-xl p-2.5 shrink-0 ${toneSoft[tone]}`}>
        <Icon className="size-5" strokeWidth={2} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-subtle uppercase tracking-wide">{label}</p>
        <p className="font-display text-lg sm:text-xl font-semibold tabular leading-tight break-words">{value}</p>
        {hint ? <p className="text-xs text-subtle mt-0.5">{hint}</p> : null}
      </div>
    </Card>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center">
      <div className="rounded-2xl bg-muted p-4">
        <Icon className="size-7 text-subtle" strokeWidth={2} aria-hidden />
      </div>
      <p className="font-display font-medium">{title}</p>
      {hint ? <p className="text-sm text-subtle max-w-sm">{hint}</p> : null}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-subtle">
      {children}
    </h2>
  );
}
