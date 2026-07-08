import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { auditLog, user } from "@/lib/db/schema";
import { requireMembership } from "@/lib/transport/org";
import { ActivityRoadmap } from "@/components/activity-roadmap";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Org-wide activity timeline (brief §5.3: the organization exposes a
 * human-readable trail). Relocated from the dashboard when it became the
 * financial overview — recorded in the decisions log.
 */
export default async function OrgActivityPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireMembership(orgId);

  const timeline = await getDb()
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorType: auditLog.actorType,
      actorId: auditLog.actorId,
      actorName: user.name,
      changes: auditLog.changes,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(eq(auditLog.organizationId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-xl font-semibold text-foreground">
        Activity
      </h1>
      <Card>
        <CardContent className="pt-6">
          <ActivityRoadmap entries={timeline} />
        </CardContent>
      </Card>
    </div>
  );
}
