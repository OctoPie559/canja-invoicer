ALTER TABLE "customers" ADD COLUMN "payment_terms_days" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_terms_days" integer;