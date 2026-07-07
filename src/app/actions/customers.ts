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
} from "@/lib/services/customers";
import type { CreateCustomerInput } from "@/lib/validation/customers";
import { requireSession, userActor } from "@/lib/transport/session";
import type { ActionState } from "./organizations";

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
    const result = await runWithActor(ctx, () =>
      createCustomer(getDb(), ctx, {
        ...customerFields(formData),
        primaryContact: inlinePrimaryContact(formData),
      }),
    );
    customerId = result.customerId;
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/customers/${customerId}`);
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
    const contactsRaw = String(formData.get("contacts") ?? "");
    let contactRows: unknown;
    if (contactsRaw) {
      try {
        contactRows = JSON.parse(contactsRaw);
      } catch {
        return { error: "Invalid contact persons payload" };
      }
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
