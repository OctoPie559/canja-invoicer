"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

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
      <p className="text-sm text-neutral-700">
        If an account exists for that email, a reset link is on its way.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h2 className="text-base font-medium">Reset your password</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-sm text-neutral-600">
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
