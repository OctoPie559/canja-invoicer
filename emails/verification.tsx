// Get the full source code, including the theme and Tailwind config:
// https://github.com/resend/react-email/tree/canary/apps/demo/emails

import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from 'react-email';
import { EmailFonts } from './fonts';
import { emailTheme } from './theme';

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : '';

interface ActivationEmailProps {
  companyName: string;
  url: string;
}

export const ActivationEmail = ({ companyName, url }: ActivationEmailProps) => (
  <Tailwind config={emailTheme}>
    <Html>
      <Head>
        <EmailFonts />
      </Head>

      <Body className="bg-canvas font-14 font-inter text-fg m-0 p-0">
        <Preview>Confirm your email address</Preview>
        <Container className="mx-auto max-w-[640px] px-4 pt-16 pb-6">
          <Section className="shadow-collage-card rounded-[8px]">
            <Section className="bg-bg border-stroke rounded-[8px] border">
              <Section className="mobile:px-6! px-10 pt-16">
                <Img
                  src={`${baseUrl}/emails/static/color-logo.png`}
                  alt=""
                  width={148}
                  height={111}
                  className="block border-none"
                />
              </Section>

              <Section className="mobile:px-6! px-10 pt-8">
                <Section className="mb-9">
                  <Text className="font-48 text-fg m-0 font-sans">
                    Almost there
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                    Thank you for signing up for {companyName}
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0">
                    To verify your account, we just need to confirm your email
                  </Text>
                </Section>

                <Button
                  href={url}
                  className="bg-brand font-15 font-inter text-fg-inverted inline-block border-none px-5 py-3.5 text-center"
                >
                  Confirm Email
                </Button>
              </Section>

              <Section className="mobile:px-6! px-10 pt-16 pb-8">
                <Text className="font-11 font-inter text-fg-3 m-0 max-w-[310px]">
                  If you didn&apos;t create an account, you can safely ignore
                  this email.
                </Text>
              </Section>

              {/* Footer */}
              <Section className="border-stroke border-t px-10 py-16">
                <Text className="font-13 font-inter text-fg-3 m-0 max-w-[320px]">
                  Collage is the workspace where your team keeps projects,
                  context, and updates together—from first idea to launch.
                </Text>

                <Row align="left">
                  <Column className="w-full pt-5 align-top">
                    <Text className="font-11 font-inter text-fg-2 m-0 max-w-[169px]">
                      <Link href={url} className="text-fg-2">
                        Unsubscribe
                      </Link>{' '}
                      from {companyName} marketing emails.
                    </Text>
                  </Column>
                </Row>
              </Section>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
);

ActivationEmail.PreviewProps = {
  companyName: 'Collage',
  url: 'https://example.com/',
} satisfies ActivationEmailProps;

export default ActivationEmail;