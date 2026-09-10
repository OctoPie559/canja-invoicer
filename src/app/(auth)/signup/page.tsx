"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { AuthHeader } from "../auth-header";
import { safeRedirect } from "@/lib/format/redirect";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // when arriving from an invitation, the address is fixed (accept checks it)
  const [invitedEmail] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("email") ?? ""),
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Sign up failed");
      return;
    }
    router.push(safeRedirect(new URLSearchParams(window.location.search).get("redirect")));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <AuthHeader
        title="Create your account"
        subtitle="A verification email will be sent. You can explore right away; verification is required before sending invoices."
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" required className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          className="h-11"
          defaultValue={invitedEmail}
          readOnly={Boolean(invitedEmail)}
        />
        {invitedEmail && (
          <p className="text-xs text-muted-foreground">
            Using the address your invitation was sent to.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password (min 8 characters)</Label>
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={8}
          className="h-11"
        />
      </div>
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="terms"
          required
          className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-foreground">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? "Creating…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Button asChild variant="link" size="xs" className="px-0 font-medium">
          <Link href="/login">Log in</Link>
        </Button>
      </p>
    </form>
  );
}
