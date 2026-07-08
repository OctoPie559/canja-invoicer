import { SERIES } from "./palette";

/**
 * Grouped monthly bars: Invoiced vs Collected, base currency. Server
 * component — the hover layer is CSS (group-hover tooltip per month), so
 * no client JS ships. Two series ⇒ legend (identity never color-alone);
 * exact values live in the tooltips and the sr-only table.
 */
export interface CashFlowPoint {
  month: string; // "2026-07"
  invoiced: { value: number; label: string };
  collected: { value: number; label: string };
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(key: string): string {
  return MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? key;
}

export function CashFlowChart({
  points,
  baseCurrency,
}: {
  points: CashFlowPoint[];
  baseCurrency: string;
}) {
  const max = Math.max(
    1,
    ...points.flatMap((p) => [p.invoiced.value, p.collected.value]),
  );
  const h = (v: number) => Math.max(v > 0 ? 3 : 0, (v / max) * 100);

  return (
    <figure className="m-0">
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: SERIES.invoiced }}
          />
          Invoiced
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: SERIES.collected }}
          />
          Collected
        </span>
        <span className="ml-auto">{baseCurrency}</span>
      </div>

      <div className="flex h-44 items-end gap-1 border-b border-border">
        {points.map((p) => (
          <div
            key={p.month}
            className="group relative flex h-full flex-1 items-end justify-center gap-0.5 rounded-t-sm px-1 transition-colors hover:bg-muted/60"
          >
            {/* tooltip — whole month column is the hit target */}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md group-hover:block">
              <p className="font-medium">{monthLabel(p.month)} {p.month.slice(0, 4)}</p>
              <p className="text-muted-foreground">
                Invoiced <span className="float-right ml-3 font-mono text-foreground">{p.invoiced.label}</span>
              </p>
              <p className="text-muted-foreground">
                Collected <span className="float-right ml-3 font-mono text-foreground">{p.collected.label}</span>
              </p>
            </div>
            <div
              className="w-3/12 max-w-4 rounded-t-[4px]"
              style={{
                height: `${h(p.invoiced.value)}%`,
                backgroundColor: SERIES.invoiced,
              }}
            />
            <div
              className="w-3/12 max-w-4 rounded-t-[4px]"
              style={{
                height: `${h(p.collected.value)}%`,
                backgroundColor: SERIES.collected,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-center text-[11px] text-muted-foreground">
        {points.map((p) => (
          <span key={p.month} className="flex-1">
            {monthLabel(p.month)}
          </span>
        ))}
      </div>

      {/* accessible table view of the same data */}
      <table className="sr-only">
        <caption>
          Monthly invoiced and collected amounts in {baseCurrency}
        </caption>
        <thead>
          <tr><th>Month</th><th>Invoiced</th><th>Collected</th></tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.month}>
              <td>{p.month}</td>
              <td>{p.invoiced.label}</td>
              <td>{p.collected.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
