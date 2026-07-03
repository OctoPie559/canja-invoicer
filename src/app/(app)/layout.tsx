import Link from "next/link";
import { requireSession } from "@/lib/transport/session";
import { SignOutButton } from "@/components/forms";
import { Badge } from "@/components/ui/badge";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link
            href="/dashboard"
            className="font-heading font-semibold text-foreground"
          >
            invoicer
          </Link>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              {session.user.email}
              {!session.user.emailVerified && (
                <Badge variant="outline">unverified</Badge>
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
