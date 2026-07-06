import type { LucideIcon } from "lucide-react";
import type { Money } from "@/lib/domain/money";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Compact display formatting for tiles ("KSh 12.9K"). Display only — the
 * value arrives as Money; no arithmetic happens outside the value object.
 */
export function formatMoneyCompact(money: Money): string {
  const major = Number(money.toDecimalString());
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: money.currency,
    notation: Math.abs(major) >= 100_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(major) >= 100_000 ? 1 : 0,
  }).format(major);
}

/**
 * Stat tile (dataviz spec): sentence-case label, semibold value in
 * proportional figures, muted context line. Status color only when the
 * value is meaningful, always alongside an icon — never color alone.
 */
export function StatTile({
  label,
  value,
  context,
  icon: Icon,
  emphasis = "none",
}: {
  label: string;
  value: string;
  context?: string;
  icon?: LucideIcon;
  emphasis?: "none" | "serious";
}) {
  return (
    <Card className="py-4">
      <CardContent className="space-y-1 px-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {Icon && (
            <Icon
              className={cn(
                "size-3.5",
                emphasis === "serious" && "text-destructive",
              )}
            />
          )}
          {label}
        </p>
        <p
          className={cn(
            "text-2xl font-semibold text-foreground",
            emphasis === "serious" && "text-destructive",
          )}
        >
          {value}
        </p>
        {context && (
          <p className="text-xs text-muted-foreground">{context}</p>
        )}
      </CardContent>
    </Card>
  );
}
