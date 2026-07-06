import {
  Activity,
  Banknote,
  Building2,
  FileText,
  MessageSquare,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { TimelineEntry } from "@/components/activity-timeline";

function iconFor(action: string): LucideIcon {
  if (action.startsWith("invoice.")) return FileText;
  if (action.startsWith("payment.")) return Banknote;
  if (action.startsWith("comment.")) return MessageSquare;
  if (action.startsWith("contact.")) return UserRound;
  if (action.startsWith("customer.")) return Building2;
  return Activity;
}

/** "contact.added" → "Contact added" */
function humanize(action: string): string {
  const text = action.replace(/[._]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function datePart(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function timePart(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).toUpperCase();
}

/**
 * Roadmap-style activity feed (per design reference): date/time rail on the
 * left, icon nodes on a vertical line, event cards on the right. Server
 * component friendly — pure props in, markup out.
 */
export function ActivityRoadmap({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ol className="space-y-0">
      {entries.map((entry, i) => {
        const Icon = iconFor(entry.action);
        const last = i === entries.length - 1;
        return (
          <li key={entry.id} className="flex gap-3">
            <div className="w-20 shrink-0 pt-1 text-right sm:w-24">
              <p className="text-xs font-medium text-foreground">
                {datePart(entry.createdAt)}
              </p>
              <p className="text-xs text-muted-foreground">
                {timePart(entry.createdAt)}
              </p>
            </div>
            <div className="flex flex-col items-center">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-primary">
                <Icon className="size-3.5" />
              </span>
              {!last && <span className="w-px flex-1 bg-border" />}
            </div>
            <div
                className={`min-w-0 flex-1 rounded-md border p-3 ${last ? "" : "mb-4"}`}
            >
              <p className="text-sm font-medium text-foreground">
                {humanize(entry.action)}
              </p>
              <p className="text-xs text-muted-foreground">
                by {entry.actorName ?? entry.actorType}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
