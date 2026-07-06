import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog, customerContacts, emailMessages } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import {
  ConflictError,
  NotFoundError,
  PermissionError,
} from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import {
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from "@/lib/services/contacts";
import {
  createCustomer,
  getCustomer,
  getCustomerMails,
  getCustomerTimeline,
  listCustomersWithPrimaryContact,
  updateCustomer,
} from "@/lib/services/customers";
import {
  acceptInvitation,
  inviteMember,
} from "@/lib/services/organizations";
import { createTestDb, expectDbRejection } from "../helpers/db";
import {
  createTwoOrgFixture,
  seedUser,
  upgradeToPro,
  type TwoOrgFixture,
} from "../helpers/fixtures";

describe("contact persons", () => {
  let db: Database;
  let fx: TwoOrgFixture;
  let customerId: string;

  const actorInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
  });

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    await upgradeToPro(db, fx.orgA);
    ({ customerId } = await createCustomer(db, actorInA(), {
      name: "Njogu-ini Career Association",
      customerType: "business",
      primaryContact: {
        firstName: "Mirriam",
        lastName: "Githinji",
        salutation: "Mrs.",
        email: "mirriam@njogu-ini.example",
        mobile: "+254712345678",
      },
    }));
  });

  it("creating a customer with an inline primary contact works in one transaction", async () => {
    const contacts = await listContacts(db, fx.orgA, customerId);
    expect(contacts.length).toBe(1);
    expect(contacts[0].isPrimary).toBe(true);
    expect(contacts[0].firstName).toBe("Mirriam");

    const timeline = await getCustomerTimeline(db, fx.orgA, customerId);
    expect(timeline.map((t) => t.action)).toContain("contact.added");

    const listed = await listCustomersWithPrimaryContact(db, fx.orgA);
    const row = listed.find((c) => c.id === customerId);
    expect(row?.primaryContact?.name).toBe("Mirriam Githinji");
    expect(row?.primaryContact?.email).toBe("mirriam@njogu-ini.example");
  });

  it("promoting a new primary demotes the old one in the same transaction", async () => {
    const { contactId } = await createContact(db, actorInA(), {
      customerId,
      firstName: "James",
      lastName: "Mwangi",
      designation: "Accounts",
      isPrimary: true,
    });
    const contacts = await listContacts(db, fx.orgA, customerId);
    const primaries = contacts.filter((c) => c.isPrimary);
    expect(primaries.length).toBe(1);
    expect(primaries[0].id).toBe(contactId);
  });

  it("the database itself rejects a second live primary", async () => {
    await expectDbRejection(
      db.insert(customerContacts).values({
        id: newId(),
        organizationId: fx.orgA,
        customerId,
        firstName: "Smuggled",
        isPrimary: true,
      }),
      /duplicate key|unique/i,
    );
  });

  it("updates are optimistically locked and audited on the customer", async () => {
    const [contact] = await listContacts(db, fx.orgA, customerId);
    await updateContact(db, actorInA(), {
      id: contact.id,
      version: contact.version,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      designation: "Managing Director",
      isPrimary: contact.isPrimary,
    });
    await expect(
      updateContact(db, actorInA(), {
        id: contact.id,
        version: contact.version, // stale now
        firstName: "Stale",
        isPrimary: false,
      }),
    ).rejects.toThrow(ConflictError);

    const timeline = await getCustomerTimeline(db, fx.orgA, customerId);
    expect(timeline.map((t) => t.action)).toContain("contact.updated");
  });

  it("mails match any contact person's email", async () => {
    await db.insert(emailMessages).values({
      id: newId(),
      organizationId: fx.orgA,
      type: "invoice_send",
      recipient: "mirriam@njogu-ini.example",
      subject: "Invoice INV-001",
      status: "sent",
    });
    const mails = await getCustomerMails(db, fx.orgA, customerId);
    expect(mails.map((m) => m.subject)).toContain("Invoice INV-001");
  });

  it("cross-tenant contact operations fail", async () => {
    // creating a contact against a foreign customer id
    await expect(
      createContact(
        db,
        { actorType: "user", actorId: fx.bob.id, organizationId: fx.orgB },
        { customerId, firstName: "Intruder", isPrimary: false },
      ),
    ).rejects.toThrow(NotFoundError);
    // viewer cannot manage contacts
    const viewer = await seedUser(db, "contacts-viewer");
    const { invitationId } = await inviteMember(db, actorInA(), {
      email: viewer.email,
      role: "viewer",
    });
    await acceptInvitation(db, { userId: viewer.id }, { invitationId });
    await expect(
      createContact(
        db,
        { actorType: "user", actorId: viewer.id, organizationId: fx.orgA },
        { customerId, firstName: "Nope", isPrimary: false },
      ),
    ).rejects.toThrow(PermissionError);
  });

  it("contacts are read-isolated across tenants (service and RLS)", async () => {
    // service read through org B's scope sees none of org A's contacts
    const viaService = await listContacts(db, fx.orgB, customerId);
    expect(viaService).toEqual([]);
    // and an unfiltered SELECT under org B's RLS-armed transaction leaks
    // nothing either — the backstop, not just the WHERE clause
    const { withOrgTransaction } = await import("@/lib/db/tx");
    const { sql } = await import("drizzle-orm");
    const { rows } = await import("../helpers/db");
    const visible = await withOrgTransaction(db, fx.orgB, async (tx) =>
      rows(await tx.execute(sql`SELECT organization_id FROM customer_contacts`)),
    );
    expect(visible.every((r) => r.organization_id === fx.orgB)).toBe(true);
    expect(
      visible.some((r) => r.organization_id === fx.orgA),
    ).toBe(false);
  });

  it("deleting a customer tombstones its contact persons too", async () => {
    const { customerId: doomed } = await createCustomer(db, actorInA(), {
      name: "Doomed Ltd",
      primaryContact: { firstName: "Grace", email: "grace@doomed.example" },
    });
    const { deleteCustomer } = await import("@/lib/services/customers");
    await deleteCustomer(db, actorInA(), { id: doomed, version: 1 });
    const remaining = await listContacts(db, fx.orgA, doomed);
    expect(remaining).toEqual([]);
    const [raw] = await db
      .select({ deletedAt: customerContacts.deletedAt })
      .from(customerContacts)
      .where(eq(customerContacts.customerId, doomed));
    expect(raw.deletedAt).not.toBeNull(); // tombstoned, not hard-deleted
  });

  it("single-save edit applies company + contact grid in one transaction", async () => {
    const { customerId: gridCustomer } = await createCustomer(db, actorInA(), {
      name: "Grid Ltd",
      primaryContact: { firstName: "Peter", email: "peter@grid.example" },
    });
    const [p1] = await listContacts(db, fx.orgA, gridCustomer);
    const { contactId: c2 } = await createContact(db, actorInA(), {
      customerId: gridCustomer,
      firstName: "Cathy",
      isPrimary: false,
    });
    const { contactId: c4 } = await createContact(db, actorInA(), {
      customerId: gridCustomer,
      firstName: "Doomed",
      isPrimary: false,
    });

    // one save: rename the company, demote Peter, promote Cathy with a new
    // designation, add a brand-new person, remove Doomed
    await updateCustomer(
      db,
      actorInA(),
      { id: gridCustomer, version: 1, name: "Grid Renamed Ltd" },
      [
        { id: p1.id, version: p1.version, firstName: "Peter", email: "peter@grid.example", isPrimary: false },
        { id: c2, version: 1, firstName: "Cathy", designation: "Accounts", isPrimary: true },
        { firstName: "Newton", email: "newton@grid.example", isPrimary: false },
        { id: c4, version: 1, firstName: "Doomed", deleted: true },
      ],
    );

    const renamed = await getCustomer(db, fx.orgA, gridCustomer);
    expect(renamed?.name).toBe("Grid Renamed Ltd");
    const after = await listContacts(db, fx.orgA, gridCustomer);
    expect(after.length).toBe(3); // Peter, Cathy, Newton — Doomed gone
    const primaries = after.filter((c) => c.isPrimary);
    expect(primaries.length).toBe(1);
    expect(primaries[0].firstName).toBe("Cathy");
    expect(primaries[0].designation).toBe("Accounts");
    expect(after.map((c) => c.firstName)).toContain("Newton");
    expect(after.map((c) => c.id)).not.toContain(c4);
  });

  it("a bad contact row rolls back the company change too (all-or-nothing)", async () => {
    const { customerId: atomicCustomer } = await createCustomer(db, actorInA(), {
      name: "Atomic Ltd",
      primaryContact: { firstName: "Ann" },
    });
    const [contact] = await listContacts(db, fx.orgA, atomicCustomer);

    await expect(
      updateCustomer(
        db,
        actorInA(),
        { id: atomicCustomer, version: 1, name: "Should Not Persist Ltd" },
        [
          {
            id: contact.id,
            version: 999, // stale — genuine conflict
            firstName: "Ann Updated",
            isPrimary: true,
          },
        ],
      ),
    ).rejects.toThrow(ConflictError);

    const untouched = await getCustomer(db, fx.orgA, atomicCustomer);
    expect(untouched?.name).toBe("Atomic Ltd"); // rolled back with the contacts
    const [contactAfter] = await listContacts(db, fx.orgA, atomicCustomer);
    expect(contactAfter.firstName).toBe("Ann");
  });

  it("soft delete removes the contact, keeps the audit trail", async () => {
    const { contactId } = await createContact(db, actorInA(), {
      customerId,
      firstName: "Temp",
      isPrimary: false,
    });
    const [row] = await listContacts(db, fx.orgA, customerId).then((list) =>
      list.filter((c) => c.id === contactId),
    );
    await deleteContact(db, actorInA(), { id: contactId, version: row.version });

    const remaining = await listContacts(db, fx.orgA, customerId);
    expect(remaining.map((c) => c.id)).not.toContain(contactId);
    const audited = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, customerId));
    expect(audited.map((a) => a.action)).toContain("contact.removed");
  });
});
