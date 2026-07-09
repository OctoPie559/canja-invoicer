import { getDb } from "@/lib/db/client";
import { getOrgTimeline } from "@/lib/services/reporting";
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

  const timeline = await getOrgTimeline(getDb(), orgId);

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
