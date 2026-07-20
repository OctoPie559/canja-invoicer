import { requireMembership } from "@/lib/transport/org";
import {
  OnboardingSteps,
  OnboardingSurveyForm,
} from "../../onboarding-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Onboarding step 2 (issue 1): "how did you hear about us" — data collection. */
export default async function OnboardingSurveyPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireMembership(orgId);
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <OnboardingSteps current={2} />
        <CardTitle className="font-heading text-lg">One quick question</CardTitle>
        <CardDescription>
          It helps us understand how people find Canja. Optional — skip if
          you&apos;d rather not say.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OnboardingSurveyForm organizationId={orgId} />
      </CardContent>
    </Card>
  );
}
