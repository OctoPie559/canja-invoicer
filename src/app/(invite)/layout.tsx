import { Logo } from "@/components/app-shell/logo";

/**
 * Public chrome for invitation acceptance — reachable while LOGGED OUT so an
 * invited person can sign up and accept without first being forced to create
 * their own workspace (issue 6). No auth guard here, unlike the (app) shell.
 */
export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-4">
          <Logo href="/" />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10">{children}</main>
    </div>
  );
}
