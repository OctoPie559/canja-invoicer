import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Status badges for estimates and credit notes (invoices have their own). */
const STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  viewed: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  accepted:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  declined: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  expired: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  converted: "bg-muted text-foreground",
  issued:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  void: "bg-muted text-muted-foreground line-through",
  // recurring-schedule statuses
  active:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ended: "bg-muted text-muted-foreground",
};

export function DocumentStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn("capitalize", STYLES[status])}>
      {status}
    </Badge>
  );
}
