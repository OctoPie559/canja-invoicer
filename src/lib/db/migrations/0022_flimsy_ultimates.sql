ALTER TABLE "subscriptions" ADD COLUMN "renewal_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "authorization_code" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "subscription_email_token" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "grace_until" timestamp with time zone;