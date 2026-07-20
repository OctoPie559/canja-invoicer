"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { ActionState } from "@/app/actions/organizations";
import {
  createOrgOnboardingAction,
  recordReferralAction,
} from "@/app/actions/organizations";
import {
  REFERRAL_SOURCES,
  REFERRAL_LABELS,
} from "@/lib/validation/organizations";
import { validateImageFile } from "@/lib/storage/images";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: ActionState = { error: null };

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}

/** "Step X of N" progress header shared by every onboarding step. */
export function OnboardingSteps({
  current,
  total = 3,
}: {
  current: number;
  total?: number;
}) {
  return (
    <div className="mb-6 flex items-center gap-2" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          className={
            "h-1.5 flex-1 rounded-full " +
            (n <= current ? "bg-primary" : "bg-muted-foreground/20")
          }
        />
      ))}
    </div>
  );
}

/** Step 1: create the workspace, with an optional logo. */
export function OnboardingOrgForm() {
  const [state, action, pending] = useActionState(
    createOrgOnboardingAction,
    initialState,
  );
  const [clientError, setClientError] = useState<string | null>(null);

  return (
    <form action={action} className="space-y-5">
      <FormError error={clientError ?? state.error} />
      <div className="space-y-2">
        <Label htmlFor="org-name">Organization name</Label>
        <Input id="org-name" name="name" required placeholder="e.g. Njogu-ini Studios" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-type">Type</Label>
        <Select name="type" defaultValue="business">
          <SelectTrigger id="org-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-logo">Logo (optional)</Label>
        <Input
          id="org-logo"
          type="file"
          name="logo"
          accept="image/png,image/jpeg"
          onChange={(e) =>
            setClientError(validateImageFile(e.target.files?.[0] ?? null))
          }
        />
        <p className="text-xs text-muted-foreground">
          PNG or JPEG, up to 512 KB. Appears on your invoices and emails. You
          can change it any time in settings.
        </p>
      </div>
      <Button
        type="submit"
        disabled={pending || clientError !== null}
        className="w-full"
      >
        <Upload className="size-4" />
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}

/** Step 2: "how did you hear about us" — data collection, skippable. */
export function OnboardingSurveyForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const [state, action, pending] = useActionState(
    recordReferralAction.bind(null, organizationId),
    initialState,
  );

  return (
    <form action={action} className="space-y-5">
      <FormError error={state.error} />
      <div className="space-y-2">
        <Label htmlFor="referral">How did you hear about us?</Label>
        <Select name="referralSource" defaultValue="search">
          <SelectTrigger id="referral" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REFERRAL_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {REFERRAL_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Continue"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/onboarding/${organizationId}/verify`}>Skip</Link>
        </Button>
      </div>
    </form>
  );
}

/** Verify step: resend the confirmation email on demand. */
export function ResendVerification({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function resend() {
    setStatus("sending");
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/dashboard",
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={resend}
        disabled={status === "sending" || status === "sent"}
      >
        {status === "sent"
          ? "Email sent"
          : status === "sending"
            ? "Sending…"
            : "Resend verification email"}
      </Button>
      {status === "error" && (
        <p className="text-sm text-destructive">
          Couldn&apos;t resend just now — try again in a moment.
        </p>
      )}
    </div>
  );
}
