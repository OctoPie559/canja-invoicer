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

interface PasswordResetEmailProps {
  /** Reset link. */
  url: string;
  /** Absolute origin for hosted images. */
  baseUrl: string;
}

export const PasswordResetEmail = ({
  url,
  baseUrl,
}: PasswordResetEmailProps) => (
  <Tailwind config={emailTheme}>
    <Html>
      <Head>
        <EmailFonts />
      </Head>

      <Body className="bg-canvas font-14 font-inter text-fg m-0 p-0">
        <Preview>Reset your Canja password</Preview>
        <Container className="mx-auto max-w-[640px] px-4 pt-16 pb-6">
          <Section className="rounded-[8px] shadow-collage-card">
            <Section className="bg-bg border-stroke rounded-[8px] border">
              <EmailLogo baseUrl={baseUrl} />

              <Section className="mobile:px-6! px-10 pt-8">
                <Section className="mb-9">
                  <Text className="font-48 text-fg m-0 font-sans">
                    Reset your password
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                    Someone requested a password reset for your Canja
                    account. Use the button below to choose a new one — for
                    your security, all sessions are signed out after the
                    reset.
                  </Text>
                </Section>

                <Button
                  href={url}
                  className="bg-brand font-15 font-inter text-fg-inverted inline-block border-none px-5 py-3.5 text-center"
                >
                  Change password
                </Button>
              </Section>

              <Section className="mobile:px-6! px-10 pt-16 pb-8">
                <Text className="font-11 font-inter text-fg-3 m-0 max-w-[310px]">
                  If you didn&apos;t request this, you can ignore this email.
                  Your password won&apos;t change until you open the link
                  above and create a new one.
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

PasswordResetEmail.PreviewProps = {
  url: 'https://example.com/reset',
  baseUrl: '',
} satisfies PasswordResetEmailProps;

export default PasswordResetEmail;
