import { requireSession } from "@/lib/transport/session";
import { OnboardingOrgForm, OnboardingSteps } from "./onboarding-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * First-run onboarding (issue 1), step 1: create the workspace with an
 * optional logo. Reached after signup for a user with no organization yet
 * (dashboard first-run redirect). Invited users never land here — they already
 * have a membership.
 */
export default async function OnboardingPage() {
  await requireSession();
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <OnboardingSteps current={1} />
        <CardTitle className="font-heading text-lg">
          Set up your workspace
        </CardTitle>
        <CardDescription>
          An organization holds your customers, products, and invoices. Create
          yours to start invoicing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OnboardingOrgForm />
      </CardContent>
    </Card>
  );
}
