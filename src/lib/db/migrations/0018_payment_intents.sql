CREATE TYPE "public"."payment_intent_purpose" AS ENUM('invoice', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_status" AS ENUM('pending', 'succeeded', 'failed', 'abandoned');--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"purpose" "payment_intent_purpose" NOT NULL,
	"invoice_id" text,
	"billing_interval" text,
	"reference" text NOT NULL,
	"provider" text NOT NULL,
	"provider_reference" text,
	"amount_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"status" "payment_intent_status" DEFAULT 'pending' NOT NULL,
	"payment_id" text,
	"initiated_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_reference_idx" ON "payment_intents" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payment_intents_org_idx" ON "payment_intents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payment_intents_invoice_idx" ON "payment_intents" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_intents_status_idx" ON "payment_intents" USING btree ("status");--> statement-breakpoint

-- org-isolation policy for the new table (the dynamic migration test fails
-- loudly if any organization_id table lacks one); grants flow from the
-- ALTER DEFAULT PRIVILEGES in 0003
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY org_isolation ON payment_intents
  FOR ALL TO invoicer_app
  USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));