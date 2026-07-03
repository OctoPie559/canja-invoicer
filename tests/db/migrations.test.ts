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
    ]) {
      expect(tables, `missing table ${expected}`).toContain(expected);
    }
  });

  it("enables RLS with an org-isolation policy on every org-scoped table", async () => {
    const result = rows(await db.execute(
      sql`SELECT c.relname AS table_name, c.relrowsecurity AS rls
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    ));
    const rlsByTable = new Map(
      result.map((r) => [r.table_name as string, r.rls as boolean]),
    );
    for (const t of ["customers", "invoices", "payments", "audit_log", "member"]) {
      expect(rlsByTable.get(t), `RLS not enabled on ${t}`).toBe(true);
    }
    const policies = rows(await db.execute(
      sql`SELECT tablename FROM pg_policies WHERE policyname = 'org_isolation'`,
    ));
    expect(policies.length).toBe(24);
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
