/**
 * Horizontal bar list — the workhorse for status, aging, and top-customer
 * breakdowns. Each row: label + colored bar + value, so identity is never
 * color-alone and every mark carries a direct label (no tooltip needed).
 * Server component, no client JS.
 */
export interface BreakdownRow {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  display: string;
  /** validated palette hex for light / dark (see charts/palette.ts) */
  color: { light: string; dark: string };
  href?: string;
}

import Link from "next/link";

export function BreakdownBars({ rows }: { rows: BreakdownRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-baseline gap-2 truncate">
                <span className="truncate font-medium">{r.label}</span>
                {r.sublabel && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.sublabel}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-xs">{r.display}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-[4px] bg-muted">
              <div
                className="h-full rounded-[4px] dark:hidden"
                style={{
                  width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%`,
                  backgroundColor: r.color.light,
                }}
              />
              <div
                className="hidden h-full rounded-[4px] dark:block"
                style={{
                  width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%`,
                  backgroundColor: r.color.dark,
                }}
              />
            </div>
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link
                href={r.href}
                className="block rounded-md p-1 -m-1 transition-colors hover:bg-muted/60"
              >
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
