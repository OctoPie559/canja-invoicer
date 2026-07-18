import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { requireMembership } from "@/lib/transport/org";
import { getSubscription } from "@/lib/services/subscriptions";
import {
  getAskSessionMessages,
  listAskSessions,
  remainingAskQuestions,
  type Citation,
} from "@/lib/services/ask";
import { AskChat } from "@/components/ask-chat";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Ask Canja (slice 9): org-scoped chat over the org's own records. Pro-gated
 * server-side (the service enforces it too — this gate is the UX).
 */
export default async function AskPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { orgId } = await params;
  const { session: selectedSession } = await searchParams;
  const { session } = await requireMembership(orgId);
  const db = getDb();

  const { plan } = await getSubscription(db, orgId);
  if (plan !== "pro") {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          Ask Canja
        </h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <Sparkles className="size-8 text-amber-500" />
            <div className="space-y-1">
              <p className="font-heading text-lg font-semibold">
                Ask your books anything
              </p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                “Who owes me money?” · “What did I collect last month?” ·
                “What&apos;s the status of INV-0047?” — Ask Canja answers from
                your own records, with links to the documents behind every
                figure. Available on the Pro plan.
              </p>
            </div>
            <Button asChild>
              <Link href={`/orgs/${orgId}/settings/billing`}>
                Upgrade to Pro
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [sessions, remaining] = await Promise.all([
    listAskSessions(db, orgId, session.user.id),
    remainingAskQuestions(db, orgId),
  ]);

  const messages =
    selectedSession && sessions.some((s) => s.id === selectedSession)
      ? (
          await getAskSessionMessages(db, orgId, session.user.id, selectedSession)
        ).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          citations: (m.citations ?? []) as Citation[],
        }))
      : [];

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          Ask Canja
        </h1>
        {remaining !== null && (
          <span className="text-xs text-muted-foreground">
            {remaining} question{remaining === 1 ? "" : "s"} left this month
          </span>
        )}
      </div>
      <AskChat
        orgId={orgId}
        sessions={sessions.map((s) => ({ id: s.id, title: s.title }))}
        sessionId={selectedSession ?? null}
        initialMessages={messages}
      />
    </div>
  );
}
