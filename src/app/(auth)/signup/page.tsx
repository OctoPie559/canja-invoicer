"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    router.push("/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h2 className="font-heading text-base font-medium">
        Create your account
      </h2>
      <p className="text-sm text-muted-foreground">
        A verification email will be sent. You can explore right away;
        verification is required before sending invoices.
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password (min 8 characters)</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create account"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Button asChild variant="link" size="xs" className="px-0">
          <Link href="/login">Sign in</Link>
        </Button>
      </p>
    </form>
  );
}
