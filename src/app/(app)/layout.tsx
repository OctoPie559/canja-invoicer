import { requireSession } from "@/lib/transport/session";

/**
 * Auth guard only. Chrome lives in the child layouts: the sidebar shell for
 * org-scoped routes, a plain top bar for org-less pages.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return <>{children}</>;
}
