import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, rows } from "../helpers/db";
import type { Database } from "@/lib/db/client";

describe("migrations", () => {
  let db: Database;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  it("creates the full entity catalog", async () => {
    const result = rows(await db.execute(
      sql`SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    ));
    const tables = result.map((r) => r.table_name as string);
    for (const expected of [
      "user",
      "session",
      "account",
      "verification",
      "organization",
      "member",
      "invitation",
      "organization_settings",
      "organization_branding",
      "tax_rates",
      "tax_rate_versions",
      "fx_rates",
      "customers",
      "customer_versions",
      "products",
      "product_versions",
      "invoices",
      "invoice_line_items",
      "estimates",
      "estimate_line_items",
      "credit_notes",
      "credit_note_line_items",
      "recurring_invoices",
      "recurring_invoice_items",
      "payments",
      "payment_events",
      "audit_log",
      "email_messages",
      "subscriptions",
      "rate_limit",
    ]) {
      expect(tables, `missing table ${expected}`).toContain(expected);
    }
  });

  it("enables RLS with an org-isolation policy on EVERY table that carries organization_id", async () => {
    // derived from the live schema, not a hardcoded list: adding a new
    // org-scoped table without an RLS policy must fail this test loudly
    const orgTables = rows(await db.execute(
      sql`SELECT c.table_name FROM information_schema.columns c
          JOIN information_schema.tables t
            ON t.table_name = c.table_name AND t.table_schema = c.table_schema
          WHERE c.table_schema = 'public'
            AND c.column_name = 'organization_id'
            AND t.table_type = 'BASE TABLE'`,
    )).map((r) => r.table_name as string).sort();
    expect(orgTables.length).toBeGreaterThanOrEqual(24);

    const rls = rows(await db.execute(
      sql`SELECT c.relname AS table_name, c.relrowsecurity AS enabled
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    ));
    const rlsByTable = new Map(
      rls.map((r) => [r.table_name as string, r.enabled as boolean]),
    );
    const policyTables = rows(await db.execute(
      sql`SELECT tablename FROM pg_policies WHERE policyname = 'org_isolation'`,
    )).map((r) => r.tablename as string).sort();

    for (const t of orgTables) {
      expect(rlsByTable.get(t), `RLS not enabled on ${t}`).toBe(true);
    }
    expect(policyTables).toEqual(orgTables);
  });

  it("revokes UPDATE and DELETE on audit_log from the app role", async () => {
    const result = rows(await db.execute(
      sql`SELECT privilege_type FROM information_schema.role_table_grants
          WHERE grantee = 'invoicer_app' AND table_name = 'audit_log'`,
    ));
    const privs = result.map((r) => r.privilege_type as string);
    expect(privs).toContain("SELECT");
    expect(privs).toContain("INSERT");
    expect(privs).not.toContain("UPDATE");
    expect(privs).not.toContain("DELETE");
  });
});
