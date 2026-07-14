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

interface VerificationEmailProps {
  /** Recipient's name, for the greeting. */
  name: string;
  /** Verification link. */
  url: string;
  /** Absolute origin for hosted images (email clients need full URLs). */
  baseUrl: string;
}

export const VerificationEmail = ({
  name,
  url,
  baseUrl,
}: VerificationEmailProps) => (
  <Tailwind config={emailTheme}>
    <Html>
      <Head>
        <EmailFonts />
      </Head>

      <Body className="bg-canvas font-14 font-inter text-fg m-0 p-0">
        <Preview>Confirm your email to start sending invoices</Preview>
        <Container className="mx-auto max-w-[640px] px-4 pt-16 pb-6">
          <Section className="shadow-collage-card rounded-[8px]">
            <Section className="bg-bg border-stroke rounded-[8px] border">
              <EmailLogo baseUrl={baseUrl} />

              <Section className="mobile:px-6! px-10 pt-8">
                <Section className="mb-9">
                  <Text className="font-48 text-fg m-0 font-sans">
                    Almost there
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                    Hi {name}, welcome to Canja.
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0">
                    Confirm your email address to unlock sending invoices —
                    everything else is ready when you are.
                  </Text>
                </Section>

                <Button
                  href={url}
                  className="bg-brand font-15 font-inter text-fg-inverted inline-block border-none px-5 py-3.5 text-center"
                >
                  Confirm email
                </Button>
              </Section>

              <Section className="mobile:px-6! px-10 pt-16 pb-8">
                <Text className="font-11 font-inter text-fg-3 m-0 max-w-[310px]">
                  If you didn&apos;t create an Canja account, you can safely
                  ignore this email.
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

VerificationEmail.PreviewProps = {
  name: 'Erick',
  url: 'https://example.com/verify',
  baseUrl: '',
} satisfies VerificationEmailProps;

export default VerificationEmail;
