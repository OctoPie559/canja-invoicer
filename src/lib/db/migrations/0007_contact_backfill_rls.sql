-- RLS for customer_contacts (grants flow from 0003's ALTER DEFAULT
-- PRIVILEGES; the dynamic migration test fails loudly without the policy).
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_isolation ON customer_contacts
  FOR ALL TO invoicer_app
  USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));
--> statement-breakpoint

-- Backfill: customers are companies now (decision 2026-07-05) — existing
-- customer email/phone becomes a primary contact person named after the
-- company, so nothing is lost before 0008 drops the columns. IDs are
-- UUIDv7 built in SQL (unix-ms timestamp in the first 48 bits, version and
-- variant bits set) to honor the sortable-PK convention.
INSERT INTO customer_contacts
  (id, organization_id, customer_id, first_name, email, mobile, is_primary,
   created_at, updated_at, version)
SELECT
  encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid::text,
  c.organization_id,
  c.id,
  c.name,
  c.email,
  c.phone,
  true,
  now(),
  now(),
  1
FROM customers c
WHERE c.email IS NOT NULL OR c.phone IS NOT NULL;
