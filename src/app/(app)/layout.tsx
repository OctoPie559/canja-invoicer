import Link from "next/link";
import { requireSession } from "@/lib/transport/session";
import { SignOutButton } from "@/components/forms";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-semibold text-neutral-900">
            invoicer
          </Link>
          <div className="flex items-center gap-4 text-sm text-neutral-600">
            <span>
              {session.user.email}
              {!session.user.emailVerified && (
                <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  unverified
                </span>
              )}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
