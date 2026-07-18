"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileText, Plus, Send, Sparkles, UserRound } from "lucide-react";
import type { Citation } from "@/lib/services/ask";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
}

const SUGGESTIONS = [
  "Who owes me money?",
  "What did I collect last month?",
  "Which invoices are overdue?",
  "Show my top customers",
];

/**
 * Ask Canja chat pane. Streams the answer over SSE (fetch reader — POST, so
 * no EventSource); citations render as links built by the SERVER from query
 * rows. History rail keeps the last sessions one click away.
 */
export function AskChat({
  orgId,
  sessions,
  sessionId,
  initialMessages,
}: {
  orgId: string;
  sessions: { id: string; title: string }[];
  sessionId: string | null;
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [currentSession, setCurrentSession] = useState(sessionId);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // switching sessions server-renders fresh history
  useEffect(() => {
    setMessages(initialMessages);
    setCurrentSession(sessionId);
  }, [sessionId, initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function ask(q: string) {
    if (!q.trim() || pending) return;
    setError(null);
    setPending(true);
    setQuestion("");
    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: q,
      citations: [],
    };
    const draftId = `draft-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: draftId, role: "assistant", content: "", citations: [] },
    ]);

    const patchDraft = (patch: Partial<ChatMessage>, append?: string) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id === draftId
            ? {
                ...m,
                ...patch,
                content: append !== undefined ? m.content + append : (patch.content ?? m.content),
              }
            : m,
        ),
      );

    try {
      const res = await fetch(`/api/orgs/${orgId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, sessionId: currentSession ?? undefined }),
      });
      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.token) patchDraft({}, payload.token);
          if (payload.error) {
            setError(payload.error);
            setMessages((prev) => prev.filter((m) => m.id !== draftId));
          }
          if (payload.done) {
            patchDraft({ id: payload.messageId, citations: payload.citations });
            if (!currentSession) {
              setCurrentSession(payload.sessionId);
              // reflect the new session in the URL + history rail
              router.replace(`/orgs/${orgId}/ask?session=${payload.sessionId}`, {
                scroll: false,
              });
              router.refresh();
            }
          }
        }
      }
    } catch {
      setError("Something went wrong. Try again.");
      setMessages((prev) => prev.filter((m) => m.id !== draftId));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-[60vh] flex-1 gap-4 lg:grid-cols-[220px_1fr]">
      {/* history rail */}
      <div className="hidden flex-col gap-1 lg:flex">
        <Button asChild variant="outline" size="sm" className="justify-start">
          <Link href={`/orgs/${orgId}/ask`}>
            <Plus />
            New chat
          </Link>
        </Button>
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/orgs/${orgId}/ask?session=${s.id}`}
            className={`truncate rounded-md px-3 py-2 text-sm ${
              s.id === currentSession
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60"
            }`}
          >
            {s.title}
          </Link>
        ))}
      </div>

      {/* chat pane */}
      <Card className="flex flex-col p-4">
        <div className="flex-1 space-y-4 overflow-y-auto">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
              <Sparkles className="size-7 text-amber-500" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Ask about your invoices, customers, and payments. Every figure
                comes from your records, with links to the documents behind it.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "max-w-[85%] space-y-2 rounded-lg bg-muted px-3 py-2 text-sm"
                }
              >
                <p className="whitespace-pre-wrap">
                  {m.content || (pending ? "…" : "")}
                </p>
                {m.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t pt-2">
                    {m.citations.map((c, i) => (
                      <Badge key={`${c.id}-${i}`} variant="outline" asChild>
                        <Link
                          href={
                            c.type === "invoice"
                              ? `/orgs/${orgId}/invoices/${c.id}`
                              : `/orgs/${orgId}/customers/${c.id}`
                          }
                          className="inline-flex items-center gap-1"
                        >
                          {c.type === "invoice" ? (
                            <FileText className="size-3" />
                          ) : (
                            <UserRound className="size-3" />
                          )}
                          {c.label}
                        </Link>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your invoices, customers, payments…"
            maxLength={500}
            disabled={pending}
          />
          <Button type="submit" disabled={pending || !question.trim()} size="icon">
            <Send />
          </Button>
        </form>
      </Card>
    </div>
  );
}
