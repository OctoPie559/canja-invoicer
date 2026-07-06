import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from 'react-email';
import { EmailFooter, EmailLogo } from './components';
import { EmailFonts } from './fonts';
import { emailTheme } from './theme';

interface InvitationEmailProps {
  /** Who sent the invitation. */
  inviterName: string;
  /** Organization being joined. */
  organizationName: string;
  /** Role the invitee will hold. */
  role: string;
  /** Accept link. */
  url: string;
  /** Absolute origin for hosted images. */
  baseUrl: string;
}

export const InvitationEmail = ({
  inviterName,
  organizationName,
  role,
  url,
  baseUrl,
}: InvitationEmailProps) => (
  <Tailwind config={emailTheme}>
    <Html>
      <Head>
        <EmailFonts />
      </Head>

      <Body className="bg-canvas font-14 font-inter text-fg m-0 p-0">
        <Preview>
          {inviterName} invited you to {organizationName} on invoicer
        </Preview>
        <Container className="mx-auto max-w-[640px] px-4 pt-16 pb-6">
          <Section className="shadow-collage-card rounded-[8px]">
            <Section className="bg-bg border-stroke rounded-[8px] border">
              <EmailLogo baseUrl={baseUrl} />

              <Section className="mobile:px-6! px-10 pt-8">
                <Section className="mb-9">
                  <Text className="font-48 text-fg m-0 font-sans">
                    You&apos;re invited
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                    {inviterName} has invited you to join{' '}
                    <strong>{organizationName}</strong> on invoicer as{' '}
                    <strong>{role}</strong>.
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0">
                    Accept the invitation to work on invoices, customers, and
                    payments together.
                  </Text>
                </Section>

                <Button
                  href={url}
                  className="bg-brand font-15 font-inter text-fg-inverted inline-block border-none px-5 py-3.5 text-center"
                >
                  Accept invitation
                </Button>
              </Section>

              <Section className="mobile:px-6! px-10 pt-16 pb-8">
                <Text className="font-11 font-inter text-fg-3 m-0 max-w-[310px]">
                  This invitation expires in 7 days. If you weren&apos;t
                  expecting it, you can safely ignore this email.
                </Text>
              </Section>

              <EmailFooter />
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
);

InvitationEmail.PreviewProps = {
  inviterName: 'Erick Ngure',
  organizationName: 'Njogu-ini Career Association',
  role: 'member',
  url: 'https://example.com/invitations/abc',
  baseUrl: '',
} satisfies InvitationEmailProps;

export default InvitationEmail;
