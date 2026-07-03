import { requireSession } from "@/lib/transport/session";
import { Logo } from "@/components/app-shell/logo";
import { UserMenu } from "@/components/app-shell/user-menu";

/** Plain top bar for org-less pages (create org, accept invitation, …). */
export default async function PlainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Logo />
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            emailVerified={session.user.emailVerified}
          />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
