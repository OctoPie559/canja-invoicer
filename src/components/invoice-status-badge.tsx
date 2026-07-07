import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/lib/domain/invoice-status";
import { cn } from "@/lib/utils";

/**
 * One visual language for invoice statuses everywhere they appear.
 * Colors follow the state's meaning: neutral while drafting, blue when
 * awaiting payment, amber when partly paid, green when settled, red when
 * late, muted when annulled.
 */
const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  overdue: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  void: "bg-muted text-muted-foreground line-through",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn("capitalize", STATUS_STYLES[status])}
    >
      {status}
    </Badge>
  );
}
