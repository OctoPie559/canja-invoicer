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

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Sign in failed");
      return;
    }
    router.push(safeRedirect(new URLSearchParams(window.location.search).get("redirect")));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <AuthHeader
        title="Welcome back"
        subtitle="Enter your email and password to access your account."
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
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Button
            asChild
            variant="link"
            size="xs"
            className="px-0 font-medium"
          >
            <Link href="/forgot-password">Forgot your password?</Link>
          </Button>
        </div>
        <PasswordInput id="password" name="password" required className="h-11" />
      </div>
      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? "Signing in…" : "Log in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Button asChild variant="link" size="xs" className="px-0 font-medium">
          <Link href="/signup">Register now</Link>
        </Button>
      </p>
    </form>
  );
}
