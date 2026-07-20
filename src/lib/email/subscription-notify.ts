import { appBaseUrl } from "@/lib/config";
import { getEmailSender, type EmailSender } from "./port";

/**
 * Subscription lifecycle notices (wave 6), sent best-effort from the billing
 * cron — plain text, so they need no JSX template and never block the cron.
 * Kept out of the pure services: the cron route calls these with the data the
 * services return, exactly like the settlement emails.
 */

interface NotifyDeps {
  sender?: EmailSender;
  baseUrl?: string;
}

async function send(
  to: string,
  subject: string,
  text: string,
  deps: NotifyDeps,
): Promise<void> {
  const sender = deps.sender ?? getEmailSender();
  await sender.send({ to, subject, text }).catch(() => {});
}

/**
 * M-Pesa (manual) heads-up: the plan can't auto-renew, so it will lapse to
 * Free at period end and they re-subscribe from billing once it does.
 */
export async function sendRenewalReminder(
  to: string,
  data: { organizationId: string; expiresOn: string; priceLabel: string },
  deps: NotifyDeps = {},
): Promise<void> {
  const baseUrl = deps.baseUrl ?? appBaseUrl();
  await send(
    to,
    "Your Canja Pro plan expires soon",
    `Your Canja Pro plan expires on ${data.expiresOn}. Because you pay by M-Pesa, it doesn't renew automatically — your workspace will move to the Free plan when the period ends. You can re-subscribe (${data.priceLabel}) any time from your billing page to restore Pro:\n\n${baseUrl}/orgs/${data.organizationId}/settings/billing`,
    deps,
  );
}

/** A card auto-renewal succeeded — a light receipt. */
export async function sendRenewalReceipt(
  to: string,
  data: { organizationId: string; amountLabel: string; nextRenewalOn?: string },
  deps: NotifyDeps = {},
): Promise<void> {
  const baseUrl = deps.baseUrl ?? appBaseUrl();
  const next = data.nextRenewalOn
    ? ` Your next renewal is on ${data.nextRenewalOn}.`
    : "";
  await send(
    to,
    "Your Canja Pro plan renewed",
    `Your Canja Pro plan renewed — ${data.amountLabel} was charged to your card.${next}\n\nManage your plan: ${baseUrl}/orgs/${data.organizationId}/settings/billing`,
    deps,
  );
}

/** The plan lapsed (grace elapsed or a period ended) — moved to Free. */
export async function sendSubscriptionEnded(
  to: string,
  data: { organizationId: string },
  deps: NotifyDeps = {},
): Promise<void> {
  const baseUrl = deps.baseUrl ?? appBaseUrl();
  await send(
    to,
    "Your Canja Pro plan has ended",
    `Your Canja Pro plan has ended and your workspace is now on the Free plan. Your data is safe — you can re-subscribe any time to unlock Pro again:\n\n${baseUrl}/orgs/${data.organizationId}/settings/billing`,
    deps,
  );
}

/** A card auto-renewal was declined — ask them to update their card. */
export async function sendDunningNotice(
  to: string,
  data: { organizationId: string; retryUntil: string },
  deps: NotifyDeps = {},
): Promise<void> {
  const baseUrl = deps.baseUrl ?? appBaseUrl();
  await send(
    to,
    "Action needed: your Canja Pro renewal didn't go through",
    `We couldn't charge your card for your Canja Pro renewal. You're still on Pro — we'll keep retrying until ${data.retryUntil}. Please check your card or update it here:\n\n${baseUrl}/orgs/${data.organizationId}/settings/billing`,
    deps,
  );
}
