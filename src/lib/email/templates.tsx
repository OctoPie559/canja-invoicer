import { render } from "@react-email/render";
import { emailAssetBaseUrl } from "@/lib/config";
import { InvitationEmail } from "../../../emails/invitation";
import { InvoiceSendEmail } from "../../../emails/invoice-send";
import { InvoiceReminderEmail } from "../../../emails/invoice-reminder";
import { EstimateSendEmail } from "../../../emails/estimate-send";
import { EstimateResponseEmail } from "../../../emails/estimate-response";
import { PasswordResetEmail } from "../../../emails/password-reset";
import { VerificationEmail } from "../../../emails/verification";
import type { EmailMessage } from "./port";

/**
 * Renders react-email templates (emails/) into ready-to-send messages —
 * HTML plus a plain-text fallback derived from the same markup, so copy
 * never drifts between the two.
 *
 * Images are HOSTED, not attached: templates reference
 * `${emailAssetBaseUrl()}/static/...`, served from public/static/. Changing
 * an image is just replacing the file there. The base URL must be publicly
 * reachable (see emailAssetBaseUrl) or email clients can't fetch it.
 */

type RenderedEmail = Omit<EmailMessage, "to">;

async function renderBoth(component: React.ReactElement): Promise<{
  html: string;
  text: string;
}> {
  const [html, text] = await Promise.all([
    render(component),
    render(component, { plainText: true }),
  ]);
  return { html, text };
}

export async function verificationEmail(params: {
  name: string;
  url: string;
}): Promise<RenderedEmail> {
  const body = await renderBoth(
    <VerificationEmail
      name={params.name}
      url={params.url}
      baseUrl={emailAssetBaseUrl()}
    />,
  );
  return { subject: "Confirm your Canja email", ...body };
}

export async function passwordResetEmail(params: {
  url: string;
}): Promise<RenderedEmail> {
  const body = await renderBoth(
    <PasswordResetEmail url={params.url} baseUrl={emailAssetBaseUrl()} />,
  );
  return { subject: "Reset your Canja password", ...body };
}

export async function invitationEmail(params: {
  inviterName: string;
  organizationName: string;
  role: string;
  url: string;
}): Promise<RenderedEmail> {
  const body = await renderBoth(
    <InvitationEmail
      inviterName={params.inviterName}
      organizationName={params.organizationName}
      role={params.role}
      url={params.url}
      baseUrl={emailAssetBaseUrl()}
    />,
  );
  return {
    subject: `You've been invited to ${params.organizationName} on Canja`,
    ...body,
  };
}

// ---------------------------------------------------------------------------
// invoice send (slice 3): rich HTML + the PDF attached. Injected into the
// pure sendInvoice service as its InvoiceEmailBuilder (same pattern as
// invitations — the service defaults to plain text and never imports JSX).

import { Money } from "@/lib/domain/money";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import type {
  InvoiceEmailBuilder,
  InvoiceReminderBuilder,
} from "@/lib/services/invoices";
import type {
  EstimateEmailBuilder,
  EstimateResponseBuilder,
} from "@/lib/services/estimates";

export const invoiceEmail: InvoiceEmailBuilder = async ({
  snapshot,
  status,
  publicUrl,
  organizationName,
  watermark,
}) => {
  const total = Money.fromMinor(
    BigInt(snapshot.totals.totalMinor),
    snapshot.currency,
  ).toString();
  const body = await renderBoth(
    <InvoiceSendEmail
      organizationName={organizationName}
      displayNumber={snapshot.displayNumber}
      total={total}
      dueDate={snapshot.dueDate ?? snapshot.issueDate}
      url={publicUrl}
      baseUrl={emailAssetBaseUrl()}
    />,
  );
  const pdf = await renderInvoicePdf({ snapshot, status, watermark });
  return {
    subject: `Invoice ${snapshot.displayNumber} from ${organizationName}`,
    ...body,
    attachments: [
      {
        filename: `${snapshot.displayNumber}.pdf`,
        contentBase64: pdf.toString("base64"),
        contentType: "application/pdf",
      },
    ],
  };
};

export const estimateEmail: EstimateEmailBuilder = async ({
  snapshot,
  publicUrl,
  organizationName,
  watermark,
}) => {
  const total = Money.fromMinor(
    BigInt(snapshot.totals.totalMinor),
    snapshot.currency,
  ).toString();
  const body = await renderBoth(
    <EstimateSendEmail
      organizationName={organizationName}
      displayNumber={snapshot.displayNumber}
      total={total}
      validUntil={snapshot.dueDate ?? ""}
      url={publicUrl}
      baseUrl={emailAssetBaseUrl()}
    />,
  );
  const pdf = await renderInvoicePdf({
    snapshot,
    status: "sent",
    watermark,
    docTitle: "ESTIMATE",
    dueLabel: "Valid until",
  });
  return {
    subject: `Quote ${snapshot.displayNumber} from ${organizationName}`,
    ...body,
    attachments: [
      {
        filename: `${snapshot.displayNumber}.pdf`,
        contentBase64: pdf.toString("base64"),
        contentType: "application/pdf",
      },
    ],
  };
};

export const estimateResponseEmail: EstimateResponseBuilder = async ({
  decision,
  snapshot,
  customerName,
  workspaceUrl,
}) => {
  const total = Money.fromMinor(
    BigInt(snapshot.totals.totalMinor),
    snapshot.currency,
  ).toString();
  const body = await renderBoth(
    <EstimateResponseEmail
      decision={decision}
      displayNumber={snapshot.displayNumber}
      customerName={customerName}
      total={total}
      url={workspaceUrl}
      baseUrl={emailAssetBaseUrl()}
    />,
  );
  return {
    subject: `Quote ${snapshot.displayNumber} was ${decision} by ${customerName}`,
    ...body,
  };
};

export const invoiceReminderEmail: InvoiceReminderBuilder = async ({
  snapshot,
  balanceDue,
  dueDate,
  daysOverdue,
  publicUrl,
  organizationName,
}) => {
  const body = await renderBoth(
    <InvoiceReminderEmail
      organizationName={organizationName}
      displayNumber={snapshot.displayNumber}
      balanceDue={balanceDue}
      dueDate={dueDate}
      daysOverdue={daysOverdue}
      url={publicUrl}
      baseUrl={emailAssetBaseUrl()}
    />,
  );
  return {
    subject: `Reminder: invoice ${snapshot.displayNumber} from ${organizationName}`,
    ...body,
  };
};
