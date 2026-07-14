import { Skeleton } from "@/components/ui/skeleton";

/**
 * Reusable loading skeletons, composed from the Skeleton primitive. These back
 * the route-level `loading.tsx` files so a fetch always shows structure in the
 * shape of the content that's coming, not a blank screen.
 */

/** Page title (+ optional action button) row. */
export function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      {action && <Skeleton className="h-9 w-32" />}
    </div>
  );
}

/** A bordered table: header row + N body rows of `cols` cells. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={`h-3.5 ${i === 0 ? "flex-[2]" : "flex-1"}`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={`h-4 ${c === 0 ? "flex-[2]" : "flex-1"}`}
              style={{ opacity: 1 - r * 0.08 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Standard list page: header + table. */
export function ListPageSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <TableSkeleton />
    </div>
  );
}

/** A single stat tile (label + big number + context). */
function StatTileSkeleton() {
  return (
    <div className="space-y-2 border bg-background p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-6 w-28" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/** A titled card with a chart-sized body. */
function ChartCardSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border bg-background p-5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}

/** Financial overview: stat tiles + charts + a table. */
export function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
      <TableSkeleton rows={5} cols={4} />
    </div>
  );
}

/** Settings and detail pages: header + a couple of cards. */
export function CardsSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="space-y-4 rounded-lg border bg-background p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-72" />
          <div className="space-y-3 pt-2">
            <Skeleton className="h-9 w-full max-w-sm" />
            <Skeleton className="h-9 w-full max-w-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}
