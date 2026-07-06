import { Badge } from "@/components/ui/badge";

export interface TimelineEntry {
  id: string;
  action: string;
  actorType: string;
  /** Resolved user name when the actor is a person. */
  actorName?: string | null;
  createdAt: Date;
}

/** Audit-fed activity timeline (server component friendly). */
export function ActivityTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ul className="divide-y text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between py-2">
          <span className="font-mono text-foreground">{entry.action}</span>
          <span className="flex items-center gap-2 text-muted-foreground">
            <Badge variant="outline">
              {entry.actorName ?? entry.actorType}
            </Badge>
            {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
