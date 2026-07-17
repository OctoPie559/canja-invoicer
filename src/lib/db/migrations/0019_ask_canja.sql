-- Ask Canja (slice 9). pgvector must exist before the ai_embeddings vector
-- column; Neon and the PGlite test harness both provide the extension.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."ai_answer_lane" AS ENUM('intent', 'semantic', 'refused', 'cached');--> statement-breakpoint
CREATE TYPE "public"."ai_chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."ai_embedding_entity" AS ENUM('invoice', 'customer', 'note');--> statement-breakpoint
CREATE TABLE "ai_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"session_id" text NOT NULL,
	"role" "ai_chat_role" NOT NULL,
	"content" text NOT NULL,
	"lane" "ai_answer_lane",
	"intent" text,
	"citations" jsonb,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"embedding_tokens" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "ai_embedding_entity" NOT NULL,
	"entity_id" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536),
	"tokens" integer,
	"embedded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_session_id_ai_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_chat_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_embeddings" ADD CONSTRAINT "ai_embeddings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_chat_messages_session_idx" ON "ai_chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_chat_messages_org_created_idx" ON "ai_chat_messages" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_chat_sessions_org_user_idx" ON "ai_chat_sessions" USING btree ("organization_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_embeddings_entity_idx" ON "ai_embeddings" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ai_embeddings_org_idx" ON "ai_embeddings" USING btree ("organization_id");--> statement-breakpoint

-- org-isolation policies for the new tables (the dynamic migration test fails
-- loudly if any organization_id table lacks one); grants flow from the
-- ALTER DEFAULT PRIVILEGES in 0003
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY org_isolation ON ai_chat_sessions
  FOR ALL TO invoicer_app
  USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));--> statement-breakpoint
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY org_isolation ON ai_chat_messages
  FOR ALL TO invoicer_app
  USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));--> statement-breakpoint
ALTER TABLE ai_embeddings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY org_isolation ON ai_embeddings
  FOR ALL TO invoicer_app
  USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));