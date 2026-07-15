"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthHeader } from "../auth-header";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.requestPasswordReset({
      email: String(form.get("email")),
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Request failed");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <AuthHeader
          title="Check your inbox"
          subtitle="If an account exists for that email, a reset link is on its way."
        />
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/login">Back to log in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <AuthHeader
        title="Reset your password"
        subtitle="Enter your email and we'll send you a link to set a new one."
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required className="h-11" />
      </div>
      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Button asChild variant="link" size="xs" className="px-0 font-medium">
          <Link href="/login">Back to log in</Link>
        </Button>
      </p>
    </form>
  );
}
