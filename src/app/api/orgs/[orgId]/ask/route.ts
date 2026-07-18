import * as Sentry from "@sentry/nextjs";
import { getDb } from "@/lib/db/client";
import { createOpenAiPort } from "@/lib/ai/openai";
import { DomainError } from "@/lib/domain/errors";
import { requireMembership } from "@/lib/transport/org";
import { answerQuestion } from "@/lib/services/ask";

/**
 * Ask Canja (slice 9): thin transport over the ask service. Streams the
 * answer as SSE lines — `{token}` per delta, then one `{done, ...}` frame
 * with the server-built citations; guard failures arrive as an `{error,
 * code}` frame on the same stream. All guards (role, entitlement, caps,
 * rate limits, Zod) live in the service.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  const { session, role } = await requireMembership(orgId);
  const body = await request.json().catch(() => ({}));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (frame: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      try {
        const result = await answerQuestion(
          getDb(),
          createOpenAiPort(),
          { organizationId: orgId, userId: session.user.id, role },
          { sessionId: body.sessionId, question: body.question },
          (token) => send({ token }),
        );
        send({
          done: true,
          sessionId: result.sessionId,
          messageId: result.messageId,
          citations: result.citations,
        });
      } catch (error) {
        if (error instanceof DomainError) {
          send({ error: error.message, code: error.code });
        } else {
          // the Response is already returned when the stream body runs, so
          // Next's onRequestError never sees failures here — capture manually
          Sentry.captureException(error);
          send({ error: "Something went wrong. Try again.", code: "internal" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
