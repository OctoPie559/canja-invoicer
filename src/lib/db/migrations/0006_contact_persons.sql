CREATE TABLE "customer_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"salutation" text,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"work_phone" text,
	"mobile" text,
	"designation" text,
	"department" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "customer_type" text DEFAULT 'business' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_address_line1" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_address_line2" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_city" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_country" text;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_contacts_org_idx" ON "customer_contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "customer_contacts_customer_idx" ON "customer_contacts" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_contacts_primary_idx" ON "customer_contacts" USING btree ("customer_id") WHERE is_primary and deleted_at is null;