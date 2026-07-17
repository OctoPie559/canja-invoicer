import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { softDelete, timestamps } from "./helpers";

/**
 * Ask Canja (slice 9): natural-language Q&A over the org's own records.
 * Chat is READ-ONLY over business data — these tables hold the conversation,
 * the per-request token/cost log (columns on assistant messages, not a
 * separate table), and the Lane-2 semantic corpus. No audit_log rows: the
 * append-only log is the financial mutation trail; the AI interaction log
 * IS ai_chat_messages.
 */

export const aiChatRole = pgEnum("ai_chat_role", ["user", "assistant"]);

/** Which path produced an assistant answer (also the cost-log dimension). */
export const aiAnswerLane = pgEnum("ai_answer_lane", [
  "intent",
  "semantic",
  "refused",
  "cached",
]);

export const aiEmbeddingEntity = pgEnum("ai_embedding_entity", [
  "invoice",
  "customer",
  "note",
]);

export const aiChatSessions = pgTable(
  "ai_chat_sessions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    /** First question, truncated — the list label. */
    title: text("title").notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("ai_chat_sessions_org_user_idx").on(t.organizationId, t.userId, t.createdAt)],
);

export const aiChatMessages = pgTable(
  "ai_chat_messages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => aiChatSessions.id),
    role: aiChatRole("role").notNull(),
    content: text("content").notNull(),
    // ---- assistant-only columns (null on user rows). Together these are the
    // per-request AI usage log: lane taken, model, tokens in/out, latency.
    lane: aiAnswerLane("lane"),
    intent: text("intent"),
    /** Server-built citation list: [{type, id, label}] — never model output. */
    citations: jsonb("citations"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    embeddingTokens: integer("embedding_tokens"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_chat_messages_session_idx").on(t.sessionId, t.createdAt),
    // powers rate limiting + the monthly question cap (COUNT by org + window)
    index("ai_chat_messages_org_created_idx").on(t.organizationId, t.createdAt),
  ],
);

/**
 * Lane-2 semantic corpus (ships empty; filled by the phase-3 embedding
 * pipeline). One compact rendered chunk per entity; embeddings generated at
 * WRITE time (issued invoices from the immutable snapshot, exactly once).
 * `embedded_at IS NULL` marks pending work for the post-response processor
 * and the daily cron sweep.
 */
export const aiEmbeddings = pgTable(
  "ai_embeddings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    entityType: aiEmbeddingEntity("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** The rendered chunk — stored so retrieval is a select, not a re-render. */
    content: text("content").notNull(),
    /** sha256 of content; unchanged hash = skip re-embed. */
    contentHash: text("content_hash").notNull(),
    // text-embedding-3-small dimensions. No HNSW index yet: per-org corpora
    // are freelancer-scale, so an org-filtered exact scan is fast and exact.
    // ponytail: add HNSW when a real org exceeds ~50k chunks.
    embedding: vector("embedding", { dimensions: 1536 }),
    tokens: integer("tokens"),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("ai_embeddings_entity_idx").on(
      t.organizationId,
      t.entityType,
      t.entityId,
    ),
    index("ai_embeddings_org_idx").on(t.organizationId),
  ],
);
