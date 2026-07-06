import { render } from "@react-email/render";
import { appBaseUrl } from "@/lib/config";
import { InvitationEmail } from "../../../emails/invitation";
import { PasswordResetEmail } from "../../../emails/password-reset";
import { VerificationEmail } from "../../../emails/verification";
import {
  LOGO_BASE64,
  LOGO_CONTENT_ID,
  LOGO_CONTENT_TYPE,
  LOGO_FILENAME,
} from "./logo";
import type { EmailAttachment, EmailMessage } from "./port";

/**
 * Renders react-email templates (emails/) into ready-to-send messages —
 * HTML plus a plain-text fallback derived from the same markup, so copy
 * never drifts between the two.
 *
 * The brand logo ships as an inline CID attachment rather than a hosted
 * image: appBaseUrl() is localhost in dev and may be a non-public preview
 * URL, and email clients fetch images through their own proxies which can't
 * reach either. Embedding the image makes it render everywhere.
 */

type RenderedEmail = Omit<EmailMessage, "to">;

const logoAttachment: EmailAttachment = {
  filename: LOGO_FILENAME,
  contentBase64: LOGO_BASE64,
  contentType: LOGO_CONTENT_TYPE,
  contentId: LOGO_CONTENT_ID,
};

/** `cid:` reference matching the inline attachment above. */
const logoSrc = `cid:${LOGO_CONTENT_ID}`;

async function renderBoth(component: React.ReactElement): Promise<{
  html: string;
  text: string;
  attachments: EmailAttachment[];
}> {
  const [html, text] = await Promise.all([
    render(component),
    render(component, { plainText: true }),
  ]);
  return { html, text, attachments: [logoAttachment] };
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
      logoSrc={logoSrc}
    />,
  );
  return { subject: "Confirm your invoicer email", ...body };
}

export async function passwordResetEmail(params: {
  url: string;
}): Promise<RenderedEmail> {
  const body = await renderBoth(
    <PasswordResetEmail
      url={params.url}
      baseUrl={appBaseUrl()}
      logoSrc={logoSrc}
    />,
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
      logoSrc={logoSrc}
    />,
  );
  return {
    subject: `You've been invited to ${params.organizationName} on invoicer`,
    ...body,
  };
}
