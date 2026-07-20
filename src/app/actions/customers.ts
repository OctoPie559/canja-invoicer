"use server";

import { redirect } from "next/navigation";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { ZodError } from "zod";
import {
  createCustomer,
  deleteCustomer,
  updateCustomer,
  uploadCustomerLogo,
} from "@/lib/services/customers";
import type { CreateCustomerInput } from "@/lib/validation/customers";
import { requireSession, userActor } from "@/lib/transport/session";
import type { ActorContext } from "@/lib/audit/context";
import type { ActionState } from "./organizations";

/** Best-effort logo attach (issue 13): a storage hiccup never fails the save;
 *  the customer is created/updated regardless and the logo is retryable. */
async function attachLogo(
  ctx: ActorContext,
  customerId: string,
  formData: FormData,
): Promise<void> {
  const logo = formData.get("logo");
  if (!(logo instanceof File) || logo.size === 0) return;
  try {
    const bytes = new Uint8Array(await logo.arrayBuffer());
    await runWithActor(ctx, () =>
      uploadCustomerLogo(getDb(), ctx, {
        customerId,
        bytes,
        contentType: logo.type,
      }),
    );
  } catch (err) {
    console.warn("customer logo upload failed", err);
  }
}

/** Parse the optional contact-grid JSON the customer form submits. */
function parseContacts(formData: FormData): unknown {
  const raw = String(formData.get("contacts") ?? "");
  if (!raw) return undefined;
  return JSON.parse(raw);
}

/** Thin wrappers (ARCHITECTURE.md §1.2): auth → ctx → one service → map. */

function mapError(error: unknown): ActionState {
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? "Invalid input" };
  }
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error;
}

function customerFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    // raw strings at the transport boundary; the service's Zod schema is
    // the authoritative validator (§5.2)
    customerType: String(
      formData.get("customerType") ?? "business",
    ) as CreateCustomerInput["customerType"],
    addressLine1: String(formData.get("addressLine1") ?? ""),
    addressLine2: String(formData.get("addressLine2") ?? ""),
    city: String(formData.get("city") ?? ""),
    country: String(formData.get("country") ?? ""),
    shippingAddressLine1: String(formData.get("shippingAddressLine1") ?? ""),
    shippingAddressLine2: String(formData.get("shippingAddressLine2") ?? ""),
    shippingCity: String(formData.get("shippingCity") ?? ""),
    shippingCountry: String(formData.get("shippingCountry") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    preferredCurrency: String(
      formData.get("preferredCurrency") ?? "",
    ) as CreateCustomerInput["preferredCurrency"],
    paymentTermsDays: String(formData.get("paymentTermsDays") ?? ""),
  };
}

/** Optional inline primary contact from the create form. */
function inlinePrimaryContact(formData: FormData) {
  const firstName = String(formData.get("contactFirstName") ?? "").trim();
  if (!firstName) return null;
  return {
    firstName,
    lastName: String(formData.get("contactLastName") ?? ""),
    email: String(formData.get("contactEmail") ?? ""),
    mobile: String(formData.get("contactMobile") ?? ""),
  };
}

export async function createCustomerAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  let customerId: string;
  try {
    let contactRows: unknown;
    try {
      contactRows = parseContacts(formData);
    } catch {
      return { error: "Invalid contact persons payload" };
    }
    const result = await runWithActor(ctx, () =>
      createCustomer(
        getDb(),
        ctx,
        {
          ...customerFields(formData),
          primaryContact: inlinePrimaryContact(formData),
        },
        contactRows as never,
      ),
    );
    customerId = result.customerId;
  } catch (error) {
    return mapError(error);
  }
  await attachLogo(ctx, customerId, formData);
  redirect(`/orgs/${organizationId}/customers/${customerId}`);
}

/**
 * Inline creation from inside another form (e.g. the invoice builder):
 * same service — same validation, permission check, and audit row — but
 * returns the created customer for the caller to select instead of
 * redirecting away from the half-built document.
 */
export async function createCustomerInlineAction(
  organizationId: string,
  formData: FormData,
): Promise<
  | { error: string }
  | {
      customer: { id: string; name: string; paymentTermsDays: number | null };
    }
> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    const fields = customerFields(formData);
    const { customerId } = await runWithActor(ctx, () =>
      createCustomer(getDb(), ctx, {
        ...fields,
        primaryContact: inlinePrimaryContact(formData),
      }),
    );
    return {
      customer: {
        id: customerId,
        name: fields.name.trim(),
        // terms aren't part of the quick form; the org default applies
        paymentTermsDays: null,
      },
    };
  } catch (error) {
    return { error: mapError(error).error ?? "Something went wrong" };
  }
}

export async function updateCustomerAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const id = String(formData.get("id") ?? "");
  try {
    // optional contact-grid payload — saved in the same transaction as the
    // company fields (service validates the parsed rows with Zod)
    let contactRows: unknown;
    try {
      contactRows = parseContacts(formData);
    } catch {
      return { error: "Invalid contact persons payload" };
    }
    await runWithActor(ctx, () =>
      updateCustomer(
        getDb(),
        ctx,
        {
          id,
          version: Number(formData.get("version") ?? 0),
          ...customerFields(formData),
        },
        contactRows as never,
      ),
    );
  } catch (error) {
    return mapError(error);
  }
  await attachLogo(ctx, id, formData);
  redirect(`/orgs/${organizationId}/customers/${id}`);
}

export async function deleteCustomerAction(
  organizationId: string,
  customerId: string,
  version: number,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      deleteCustomer(getDb(), ctx, { id: customerId, version }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/customers`);
}
