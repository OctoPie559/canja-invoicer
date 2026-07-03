-- SET ROLE requires membership: the login role that the app connects as must
-- be a member of invoicer_app, or withOrgTransaction's `SET LOCAL ROLE`
-- fails with 42501 (seen on Neon as neondb_owner). Migrations run over the
-- same DATABASE_URL as the app, so granting to current_user covers every
-- environment; superuser test databases (PGlite) are unaffected.

DO $$
BEGIN
  EXECUTE format('GRANT invoicer_app TO %I', current_user);
END $$;
