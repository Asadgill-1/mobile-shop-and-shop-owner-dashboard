import { Calculator } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default function PosPage() {
  return (
    <>
      <PageHeader title="POS" sub="Counter sales" />
      <Card>
        <EmptyState
          icon={Calculator}
          title="POS arrives in Phase 3"
          hint="Walk-in counter sales with cart, stock decrement and tax invoices. Until then, counter sales are recorded from the shop-owner bot's 🧾 Today sell photo flow."
        />
      </Card>
    </>
  );
}
