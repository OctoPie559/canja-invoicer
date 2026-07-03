CREATE TYPE "public"."credit_note_status" AS ENUM('draft', 'issued', 'void');--> statement-breakpoint
CREATE TYPE "public"."estimate_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'expired', 'converted');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'partial', 'paid', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('mpesa', 'bank', 'cash', 'card', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_source" AS ENUM('manual', 'gateway');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'system', 'api_key');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"effective_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organization_branding" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"logo_key" text,
	"accent_color" text,
	"legal_name" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"country" text,
	"kra_pin" text,
	"contact_email" text,
	"contact_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "organization_branding_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"base_currency" text DEFAULT 'KES' NOT NULL,
	"invoice_prefix" text DEFAULT 'INV' NOT NULL,
	"invoice_next_number" integer DEFAULT 1 NOT NULL,
	"estimate_prefix" text DEFAULT 'EST' NOT NULL,
	"estimate_next_number" integer DEFAULT 1 NOT NULL,
	"credit_note_prefix" text DEFAULT 'CN' NOT NULL,
	"credit_note_next_number" integer DEFAULT 1 NOT NULL,
	"default_payment_terms_days" integer DEFAULT 30 NOT NULL,
	"default_tax_rate_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "organization_settings_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "tax_rate_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tax_rate_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"changed_by" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"rate_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"changed_by" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"country" text,
	"notes" text,
	"preferred_currency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"changed_by" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit_label" text,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"default_tax_rate_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_note_line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"credit_note_id" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"line_total_minor" bigint DEFAULT 0 NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"status" "credit_note_status" DEFAULT 'draft' NOT NULL,
	"display_number" text,
	"currency" text NOT NULL,
	"fx_rate_to_base" numeric(18, 8),
	"issue_date" date,
	"subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"tax_total_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"reason" text,
	"snapshot" jsonb,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"estimate_id" text NOT NULL,
	"product_id" text,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"discount_bps" integer DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"line_total_minor" bigint DEFAULT 0 NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"status" "estimate_status" DEFAULT 'draft' NOT NULL,
	"display_number" text,
	"currency" text NOT NULL,
	"fx_rate_to_base" numeric(18, 8),
	"issue_date" date,
	"expiry_date" date,
	"subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"discount_total_minor" bigint DEFAULT 0 NOT NULL,
	"tax_total_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"public_token" text,
	"snapshot" jsonb,
	"issued_at" timestamp with time zone,
	"converted_invoice_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "estimates_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"product_id" text,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"discount_bps" integer DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"line_total_minor" bigint DEFAULT 0 NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"display_number" text,
	"currency" text NOT NULL,
	"fx_rate_to_base" numeric(18, 8),
	"issue_date" date,
	"due_date" date,
	"subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"discount_total_minor" bigint DEFAULT 0 NOT NULL,
	"tax_total_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"amount_paid_minor" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"public_token" text,
	"snapshot" jsonb,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "invoices_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "recurring_invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"recurring_invoice_id" text NOT NULL,
	"product_id" text,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"discount_bps" integer DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recurring_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"status" "recurring_status" DEFAULT 'active' NOT NULL,
	"currency" text NOT NULL,
	"frequency" text NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"next_run_at" timestamp with time zone,
	"end_date" date,
	"auto_issue" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"terms" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processing_status" text DEFAULT 'received' NOT NULL,
	"payment_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"fx_rate_used" numeric(18, 8),
	"amount_in_invoice_currency_minor" bigint DEFAULT 0 NOT NULL,
	"settlement_delta_minor" bigint DEFAULT 0 NOT NULL,
	"method" "payment_method" NOT NULL,
	"source" "payment_source" DEFAULT 'manual' NOT NULL,
	"provider" text,
	"provider_transaction_id" text,
	"paid_at" timestamp with time zone NOT NULL,
	"recorded_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_id" text,
	"actor_type" "actor_type" NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"changes" jsonb,
	"metadata" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text,
	"entity_type" text,
	"entity_id" text,
	"provider_message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "subscriptions_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_branding" ADD CONSTRAINT "organization_branding_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rate_versions" ADD CONSTRAINT "tax_rate_versions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rate_versions" ADD CONSTRAINT "tax_rate_versions_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_versions" ADD CONSTRAINT "customer_versions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_versions" ADD CONSTRAINT "customer_versions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_default_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("default_tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_converted_invoice_id_invoices_id_fk" FOREIGN KEY ("converted_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice_items" ADD CONSTRAINT "recurring_invoice_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice_items" ADD CONSTRAINT "recurring_invoice_items_recurring_invoice_id_recurring_invoices_id_fk" FOREIGN KEY ("recurring_invoice_id") REFERENCES "public"."recurring_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice_items" ADD CONSTRAINT "recurring_invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_org_pair_date_idx" ON "fx_rates" USING btree ("organization_id","from_currency","to_currency","effective_date");--> statement-breakpoint
CREATE INDEX "customer_versions_customer_idx" ON "customer_versions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_org_idx" ON "customers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "product_versions_product_idx" ON "product_versions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_org_idx" ON "products" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "credit_note_line_items_cn_idx" ON "credit_note_line_items" USING btree ("credit_note_id");--> statement-breakpoint
CREATE INDEX "credit_notes_org_idx" ON "credit_notes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_idx" ON "credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_org_display_number_idx" ON "credit_notes" USING btree ("organization_id","display_number") WHERE display_number is not null;--> statement-breakpoint
CREATE INDEX "estimate_line_items_estimate_idx" ON "estimate_line_items" USING btree ("estimate_id");--> statement-breakpoint
CREATE INDEX "estimates_org_idx" ON "estimates" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estimates_org_display_number_idx" ON "estimates" USING btree ("organization_id","display_number") WHERE display_number is not null;--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_display_number_idx" ON "invoices" USING btree ("organization_id","display_number") WHERE display_number is not null;--> statement-breakpoint
CREATE INDEX "recurring_invoice_items_recurring_idx" ON "recurring_invoice_items" USING btree ("recurring_invoice_id");--> statement-breakpoint
CREATE INDEX "recurring_invoices_org_idx" ON "recurring_invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_idx" ON "payment_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_events_org_idx" ON "payment_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_org_idx" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_txn_idx" ON "payments" USING btree ("provider_transaction_id");--> statement-breakpoint
CREATE INDEX "audit_log_org_created_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_org_entity_idx" ON "audit_log" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "email_messages_org_idx" ON "email_messages" USING btree ("organization_id");