"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    router.push("/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h2 className="font-heading text-base font-medium">Sign in</h2>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex justify-between">
        <Button asChild variant="link" size="xs" className="px-0">
          <Link href="/signup">Create account</Link>
        </Button>
        <Button asChild variant="link" size="xs" className="px-0">
          <Link href="/forgot-password">Forgot password?</Link>
        </Button>
      </div>
    </form>
  );
}
