import Link from "next/link";

/** Shared chrome and typography for the public legal pages. */
export function LegalShell({
  title,
  updated,
  summary,
  children,
}: {
  title: string;
  updated: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="font-semibold">
            Canja
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last updated {updated}
        </p>
        <p className="mt-4 text-base text-muted-foreground">{summary}</p>
        <div className="mt-8 space-y-8 text-sm leading-relaxed">{children}</div>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-3xl px-4 py-6 text-xs text-muted-foreground">
          Syncra Technologies · Reg. BNMJS5RQ3K · 2nd Floor, Imara Daima,
          Imara Lane, Embakasi, Nairobi · support@syncra.co.ke
        </div>
      </footer>
    </div>
  );
}

export function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
      {children}
    </section>
  );
}

export function Sub({ heading }: { heading: string }) {
  return <h3 className="pt-2 font-medium">{heading}</h3>;
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Fields the operator must fill in before this page can be published. */
export function Fill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-amber-100 px-1 font-mono text-xs text-amber-900">
      {children}
    </span>
  );
}
