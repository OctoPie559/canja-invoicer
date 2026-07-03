-- Tenant-isolation backstop and append-only audit log (PROJECT_BRIEF.md §5.2).
--
-- The application executes org-scoped transactions as the non-superuser role
-- `invoicer_app` (see src/lib/db/tx.ts): RLS policies keyed on the
-- transaction-local `app.current_org_id` setting make cross-tenant reads and
-- writes impossible even if service code forgets an organization_id filter.
-- Migrations and Better Auth internals run as the table owner, which RLS does
-- not restrict (no FORCE), so auth flows and admin tasks are unaffected.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'invoicer_app') THEN
    CREATE ROLE invoicer_app NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO invoicer_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO invoicer_app;
--> statement-breakpoint

-- The audit log is append-only AT THE DATABASE LEVEL for the application
-- role. A trail that can be rewritten is not a trail.
REVOKE UPDATE, DELETE ON audit_log FROM invoicer_app;
--> statement-breakpoint

-- Enable RLS + an org-isolation policy on every org-scoped table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'member',
    'invitation',
    'organization_settings',
    'organization_branding',
    'tax_rates',
    'tax_rate_versions',
    'fx_rates',
    'customers',
    'customer_versions',
    'products',
    'product_versions',
    'invoices',
    'invoice_line_items',
    'estimates',
    'estimate_line_items',
    'credit_notes',
    'credit_note_line_items',
    'recurring_invoices',
    'recurring_invoice_items',
    'payments',
    'payment_events',
    'audit_log',
    'email_messages',
    'subscriptions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      $p$CREATE POLICY org_isolation ON %I
           FOR ALL TO invoicer_app
           USING (organization_id = current_setting('app.current_org_id', true))
           WITH CHECK (organization_id = current_setting('app.current_org_id', true))$p$,
      t
    );
  END LOOP;
END $$;
