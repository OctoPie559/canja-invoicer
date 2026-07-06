import { render } from "@react-email/render";
import { appBaseUrl } from "@/lib/config";
import { InvitationEmail } from "../../../emails/invitation";
import { PasswordResetEmail } from "../../../emails/password-reset";
import { VerificationEmail } from "../../../emails/verification";
import type { EmailMessage } from "./port";

/**
 * Renders react-email templates (emails/) into ready-to-send messages —
 * HTML plus a plain-text fallback derived from the same markup, so copy
 * never drifts between the two.
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
      baseUrl={appBaseUrl()}
    />,
  );
  return { subject: "Confirm your invoicer email", ...body };
}

export async function passwordResetEmail(params: {
  url: string;
}): Promise<RenderedEmail> {
  const body = await renderBoth(
    <PasswordResetEmail url={params.url} baseUrl={appBaseUrl()} />,
  );
  return { subject: "Reset your invoicer password", ...body };
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
      baseUrl={appBaseUrl()}
    />,
  );
  return {
    subject: `You've been invited to ${params.organizationName} on invoicer`,
    ...body,
  };
}
