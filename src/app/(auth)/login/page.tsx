"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

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
      <h2 className="text-base font-medium">Sign in</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="Password"
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <div className="flex justify-between text-sm text-neutral-600">
        <Link href="/signup" className="underline">
          Create account
        </Link>
        <Link href="/forgot-password" className="underline">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
