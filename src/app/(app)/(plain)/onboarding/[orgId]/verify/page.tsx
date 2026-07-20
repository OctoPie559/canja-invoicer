import Link from "next/link";
import { MailCheck } from "lucide-react";
import { requireMembership } from "@/lib/transport/org";
import { OnboardingSteps, ResendVerification } from "../../onboarding-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Onboarding final step (issue 1): tell the new owner to click the
 * verification link. Not a hard gate — they can explore right away; sending
 * invoices is what requires a verified email (see signup copy).
 */
export default async function OnboardingVerifyPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { session } = await requireMembership(orgId);
  const verified = session.user.emailVerified;

  return (
    <Card className="mx-auto max-w-lg text-center">
      <CardHeader>
        <OnboardingSteps current={3} />
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="size-6 text-primary" />
        </div>
        <CardTitle className="font-heading text-lg">
          {verified ? "You're all set" : "Check your email"}
        </CardTitle>
        <CardDescription>
          {verified
            ? "Your email is verified and your workspace is ready to go."
            : `We sent a verification link to ${session.user.email}. Click it to confirm your address — you can start exploring in the meantime.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {!verified && <ResendVerification email={session.user.email} />}
        <Button asChild className="w-full">
          <Link href={`/orgs/${orgId}`}>Go to my workspace</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
