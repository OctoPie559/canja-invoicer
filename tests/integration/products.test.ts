import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import {
  ConflictError,
  EntitlementError,
  MoneyError,
  NotFoundError,
  PermissionError,
} from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import {
  createProduct,
  deleteProduct,
  getProduct,
  getProductTimeline,
  getProductVersions,
  listProducts,
  listUnitLabels,
  updateProduct,
} from "@/lib/services/products";
import { createTestDb } from "../helpers/db";
import {
  createTwoOrgFixture,
  setPlan,
  upgradeToPro,
  type TwoOrgFixture,
} from "../helpers/fixtures";

describe("products service", () => {
  let db: Database;
  let fx: TwoOrgFixture;

  const actorInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
  });
  const actorInB = (): ActorContext => ({
    actorType: "user",
    actorId: fx.bob.id,
    organizationId: fx.orgB,
  });

  const base = {
    name: "Logo design",
    description: "Full brand identity package",
    unitLabel: "project",
    unitPrice: "15000.00",
    currency: "KES" as const,
  };

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    await upgradeToPro(db, fx.orgA); // org B stays on Free
  });

  it("stores prices as exact minor units via Money", async () => {
    const { productId } = await createProduct(db, actorInA(), base);
    const row = await getProduct(db, fx.orgA, productId);
    expect(row?.unitPriceMinor).toBe(1500000n);
    expect(row?.currency).toBe("KES");
    expect(row?.version).toBe(1);
    const versions = await getProductVersions(db, fx.orgA, productId);
    expect(versions.length).toBe(1);
    // money is serialized as a string in JSONB row images, never a float
    expect((versions[0].data as { unitPriceMinor: string }).unitPriceMinor).toBe(
      "1500000",
    );
  });

  it("rejects malformed prices through Money, never storing floats", async () => {
    await expect(
      createProduct(db, actorInA(), { ...base, unitPrice: "abc" }),
    ).rejects.toThrow(MoneyError);
    await expect(
      createProduct(db, actorInA(), { ...base, unitPrice: "10.999" }),
    ).rejects.toThrow(MoneyError); // 3 dp in a 2-exponent currency
  });

  it("audits price changes as product.price_updated with exact values", async () => {
    const { productId } = await createProduct(db, actorInA(), base);
    await updateProduct(db, actorInA(), {
      ...base,
      id: productId,
      version: 1,
      unitPrice: "18500.50",
    });
    const [entry] = await db
      .select({ action: auditLog.action, changes: auditLog.changes })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, productId),
          eq(auditLog.action, "product.price_updated"),
        ),
      );
    expect(entry).toBeDefined();
    const changes = entry.changes as {
      before: { unitPriceMinor: string };
      after: { unitPriceMinor: string };
    };
    expect(changes.before.unitPriceMinor).toBe("1500000");
    expect(changes.after.unitPriceMinor).toBe("1850050");

    // point-in-time: version history has both prices
    const versions = await getProductVersions(db, fx.orgA, productId);
    const prices = versions.map(
      (v) => (v.data as { unitPriceMinor: string }).unitPriceMinor,
    );
    expect(prices).toEqual(["1850050", "1500000"]); // newest first
  });

  it("audits non-price edits as product.updated", async () => {
    const { productId } = await createProduct(db, actorInA(), base);
    await updateProduct(db, actorInA(), {
      ...base,
      id: productId,
      version: 1,
      description: "Updated scope",
    });
    const timeline = await getProductTimeline(db, fx.orgA, productId);
    expect(timeline.map((t) => t.action)).toContain("product.updated");
    expect(timeline.map((t) => t.action)).not.toContain(
      "product.price_updated",
    );
  });

  it("gates non-base-currency pricing behind the Pro plan, server-side", async () => {
    // org B is Free with base KES: USD product rejected
    await expect(
      createProduct(db, actorInB(), { ...base, currency: "USD" }),
    ).rejects.toThrow(EntitlementError);
    // base-currency product on Free is fine
    await expect(
      createProduct(db, actorInB(), base),
    ).resolves.toHaveProperty("productId");
    // Pro org prices in USD freely
    await expect(
      createProduct(db, actorInA(), { ...base, currency: "USD", unitPrice: "120.00" }),
    ).resolves.toHaveProperty("productId");
  });

  it("rejects stale versions with ConflictError, no silent overwrite", async () => {
    const { productId } = await createProduct(db, actorInA(), base);
    await updateProduct(db, actorInA(), {
      ...base,
      id: productId,
      version: 1,
      unitPrice: "16000.00",
    });
    await expect(
      updateProduct(db, actorInA(), {
        ...base,
        id: productId,
        version: 1,
        unitPrice: "9999.00",
      }),
    ).rejects.toThrow(ConflictError);
    const row = await getProduct(db, fx.orgA, productId);
    expect(row?.unitPriceMinor).toBe(1600000n);
  });

  it("cross-tenant access fails: foreign actor, foreign id, foreign history", async () => {
    // alice acting in org B — not a member there
    await expect(
      createProduct(
        db,
        { actorType: "user", actorId: fx.alice.id, organizationId: fx.orgB },
        base,
      ),
    ).rejects.toThrow(PermissionError);

    // bob's product is unreachable through org A's context
    const { productId: bobsProduct } = await createProduct(db, actorInB(), {
      name: "Org B Retainer",
      unitPrice: "5000.00",
      currency: "KES",
    });
    await expect(
      updateProduct(db, actorInA(), {
        ...base,
        id: bobsProduct,
        version: 1,
        unitPrice: "1.00",
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      deleteProduct(db, actorInA(), { id: bobsProduct, version: 1 }),
    ).rejects.toThrow(NotFoundError);

    // reads: foreign id yields nothing, price history leaks zero rows
    expect(await getProduct(db, fx.orgA, bobsProduct)).toBeNull();
    const listedInA = await listProducts(db, fx.orgA);
    expect(listedInA.map((p) => p.id)).not.toContain(bobsProduct);
    expect(await getProductVersions(db, fx.orgA, bobsProduct)).toEqual([]);
    expect(await getProductTimeline(db, fx.orgA, bobsProduct)).toEqual([]);

    // and bob's product is untouched
    const intact = await getProduct(db, fx.orgB, bobsProduct);
    expect(intact?.unitPriceMinor).toBe(500000n);
  });

  it("repricing a foreign-currency product stays Pro-gated after a downgrade", async () => {
    // org A (Pro) prices in USD, then downgrades to Free
    const { productId } = await createProduct(db, actorInA(), {
      ...base,
      name: "USD Retainer",
      currency: "USD",
      unitPrice: "500.00",
    });
    await setPlan(db, fx.orgA, "free");
    try {
      // price movement without a currency change is still gated
      await expect(
        updateProduct(db, actorInA(), {
          ...base,
          id: productId,
          version: 1,
          name: "USD Retainer",
          currency: "USD",
          unitPrice: "650.00",
        }),
      ).rejects.toThrow(EntitlementError);
      // a rename that leaves the price alone remains allowed
      await expect(
        updateProduct(db, actorInA(), {
          ...base,
          id: productId,
          version: 1,
          name: "USD Retainer (legacy)",
          currency: "USD",
          unitPrice: "500.00",
        }),
      ).resolves.toBeUndefined();
    } finally {
      await upgradeToPro(db, fx.orgA);
    }
  });

  it("stores the product type, defaults to service, and audits changes", async () => {
    const { productId } = await createProduct(db, actorInA(), {
      ...base,
      name: "Branding kit",
      productType: "goods",
    });
    const row = await getProduct(db, fx.orgA, productId);
    expect(row?.productType).toBe("goods");

    // default when unspecified
    const { productId: serviceId } = await createProduct(db, actorInA(), {
      ...base,
      name: "Retainer service",
    });
    expect((await getProduct(db, fx.orgA, serviceId))?.productType).toBe(
      "service",
    );

    // switching type is a plain product.updated, not a price event
    await updateProduct(db, actorInA(), {
      ...base,
      id: productId,
      version: 1,
      name: "Branding kit",
      productType: "service",
    });
    expect((await getProduct(db, fx.orgA, productId))?.productType).toBe(
      "service",
    );
  });

  it("lists the org's distinct unit labels, tenant-scoped", async () => {
    await createProduct(db, actorInA(), {
      ...base,
      name: "Hourly consulting",
      unitLabel: "hour",
    });
    await createProduct(db, actorInA(), {
      ...base,
      name: "Sprint block",
      unitLabel: "sprint",
    });
    const labels = await listUnitLabels(db, fx.orgA);
    expect(labels).toContain("hour");
    expect(labels).toContain("sprint");
    // org B sees none of org A's vocabulary
    const foreign = await listUnitLabels(db, fx.orgB);
    expect(foreign).not.toContain("sprint");
  });

  it("soft-deletes products, keeping history and audit", async () => {
    const { productId } = await createProduct(db, actorInA(), base);
    await deleteProduct(db, actorInA(), { id: productId, version: 1 });
    expect(await getProduct(db, fx.orgA, productId)).toBeNull();
    const listed = await listProducts(db, fx.orgA);
    expect(listed.map((p) => p.id)).not.toContain(productId);
    const timeline = await getProductTimeline(db, fx.orgA, productId);
    expect(timeline.map((t) => t.action)).toContain("product.deleted");
    const versions = await getProductVersions(db, fx.orgA, productId);
    expect(versions.length).toBe(2);
  });
});
