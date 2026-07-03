-- Future-proof the invoicer_app grants (verifier finding m5):
-- 1. Tables created by migrations AFTER 0001 (e.g. rate_limit in 0002) need
--    their privileges granted; re-run the blanket grant.
-- 2. ALTER DEFAULT PRIVILEGES makes every table created by the migration
--    role from now on carry the grants automatically, so a forgotten GRANT
--    cannot silently lock the app role out (RLS policies still must be
--    added per org-scoped table — the dynamic migration test enforces that).

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO invoicer_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON audit_log FROM invoicer_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO invoicer_app;
