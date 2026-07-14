import type { PaymentProvider } from "./provider";
import { getPaystackProvider } from "./paystack";

/**
 * Resolves the active payment provider. Paystack is the only one today; adding
 * Daraja/Flutterwave later means implementing the port and choosing here — no
 * change ripples into the services that consume the interface.
 */
export function getPaymentProvider(): PaymentProvider | null {
  return getPaystackProvider();
}

/** Whether live collection is configured (gates the Pay-now / Upgrade UI). */
export function isPaymentsConfigured(): boolean {
  return getPaymentProvider() !== null;
}

export type {
  PaymentProvider,
  ProviderEvent,
  ChargeSession,
  InitiateChargeParams,
} from "./provider";
export { newChargeReference } from "./provider";
