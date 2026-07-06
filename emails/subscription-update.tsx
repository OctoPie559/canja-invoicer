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

/**
 * Sent when an invoicer subscription renews or changes (slice 8 — billing).
 * Not wired to a send function yet; the template ships rebranded and ready
 * so wiring is a one-liner when Paystack billing lands.
 */

interface SubscriptionUpdateProps {
  /** Recipient's name, for the greeting. */
  userName: string;
  /** Plan display name, e.g. "Pro". */
  planName: string;
  /** Formatted recurring price, e.g. "KES 1,500". */
  planPrice: string;
  /** Billing cycle label, e.g. "month". */
  cycleLabel: string;
  /** Formatted date of the next charge. */
  nextBillingDate: string;
  /** Manage-subscription link. */
  url: string;
  /** Absolute origin for hosted images. */
  baseUrl: string;
}

export const SubscriptionUpdate = ({
  userName,
  planName,
  planPrice,
  cycleLabel,
  nextBillingDate,
  url,
  baseUrl,
}: SubscriptionUpdateProps) => (
  <Tailwind config={emailTheme}>
    <Html>
      <Head>
        <EmailFonts />
      </Head>

      <Body className="bg-canvas font-14 font-inter text-fg m-0 p-0">
        <Preview>Your invoicer {planName} plan renewed</Preview>
        <Container className="mx-auto max-w-[640px] px-4 pt-16 pb-6">
          <Section className="shadow-collage-card rounded-[8px]">
            <Section className="bg-bg border-stroke rounded-[8px] border">
              <EmailLogo baseUrl={baseUrl} />

              <Section className="mobile:px-6! px-10 pt-8">
                <Section className="mb-9">
                  <Text className="font-48 text-fg m-0 font-sans">
                    Plan renewed
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                    Hi {userName}. Your invoicer subscription renewed for
                    another {cycleLabel}. Here&apos;s a quick summary of your
                    plan and billing.
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                    You&apos;re on the <strong>{planName}</strong> plan at{' '}
                    {planPrice} per {cycleLabel}. Your next charge is on{' '}
                    {nextBillingDate}. Review invoices, update payment
                    details, or change plans anytime from your billing
                    settings.
                  </Text>
                </Section>

                <Button
                  href={url}
                  className="bg-brand font-15 font-inter text-fg-inverted inline-block border-none px-5 py-3.5 text-center"
                >
                  Manage subscription
                </Button>
              </Section>

              <Section className="mobile:px-6! px-10 pt-16 pb-8">
                <Text className="font-11 font-inter text-fg-3 m-0 max-w-[310px]">
                  Something look off? Reply to this email and we&apos;ll help
                  sort it out.
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

SubscriptionUpdate.PreviewProps = {
  userName: 'Erick',
  planName: 'Pro',
  planPrice: 'KES 1,500',
  cycleLabel: 'month',
  nextBillingDate: '6 August 2026',
  url: 'https://example.com/billing',
  baseUrl: '',
} satisfies SubscriptionUpdateProps;

export default SubscriptionUpdate;
