import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Html,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from 'react-email';
import { EmailFooter, EmailLogo } from './components';
import { EmailFonts } from './fonts';
import { emailTheme } from './theme';

/**
 * Sent when an organization upgrades to a paid invoicer plan (slice 8 —
 * billing). Not wired to a send function yet; the template ships rebranded
 * and ready so wiring is a one-liner when Paystack billing lands.
 */

interface SubscriptionConfirmationProps {
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
  /** Formatted charge breakdown. */
  subtotal: string;
  tax: string;
  total: string;
  /** Manage-subscription link. */
  url: string;
  /** Absolute origin for hosted images. */
  baseUrl: string;
}

export const SubscriptionConfirmation = ({
  userName,
  planName,
  planPrice,
  cycleLabel,
  nextBillingDate,
  subtotal,
  tax,
  total,
  url,
  baseUrl,
}: SubscriptionConfirmationProps) => (
  <Tailwind config={emailTheme}>
    <Html>
      <Head>
        <EmailFonts />
      </Head>

      <Body className="bg-canvas font-14 font-inter text-fg m-0 p-0">
        <Preview>Your invoicer {planName} plan is active</Preview>
        <Container className="mx-auto max-w-[640px] px-4 pt-16 pb-6">
          <Section className="shadow-collage-card rounded-[8px]">
            <Section className="bg-bg border-stroke rounded-[8px] border">
              <EmailLogo baseUrl={baseUrl} />

              <Section className="mobile:px-6! px-10 pt-8 pb-8">
                <Section className="mb-9">
                  <Text className="font-48 text-fg m-0 font-sans">
                    Subscription confirmed
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                    Hi {userName}, thanks for upgrading. Your organization is
                    now on the invoicer <strong>{planName}</strong> plan, and
                    everything it includes is unlocked.
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                    You&apos;re billed {planPrice} per {cycleLabel}. Your next
                    charge is on {nextBillingDate}. You can update payment
                    details or cancel anytime from your billing settings.
                  </Text>
                </Section>

                <Section className="mb-10">
                  <Section className="mb-[3px] bg-[#EDF0E9] p-3">
                    <Row>
                      <Column>
                        <Text className="font-14 font-inter text-fg m-0">
                          Subtotal
                        </Text>
                      </Column>
                      <Column align="right">
                        <Text className="font-14 font-inter text-fg m-0">
                          {subtotal}
                        </Text>
                      </Column>
                    </Row>
                  </Section>
                  <Section className="mb-[3px] bg-[#EDF0E9] p-3">
                    <Row>
                      <Column>
                        <Text className="font-14 font-inter text-fg m-0">
                          VAT
                        </Text>
                      </Column>
                      <Column align="right">
                        <Text className="font-14 font-inter text-fg m-0">
                          {tax}
                        </Text>
                      </Column>
                    </Row>
                  </Section>
                  <Section className="bg-[#D3D9CB] p-3">
                    <Row>
                      <Column>
                        <Text className="font-14 font-inter text-fg m-0">
                          Total
                        </Text>
                      </Column>
                      <Column align="right">
                        <Text className="font-14 font-inter text-fg m-0">
                          {total}
                        </Text>
                      </Column>
                    </Row>
                  </Section>
                </Section>

                <Button
                  href={url}
                  className="bg-brand font-15 font-inter text-fg-inverted inline-block border-none px-5 py-3.5 text-center"
                >
                  Manage subscription
                </Button>
              </Section>

              <Section className="mobile:px-6! px-10 pt-8 pb-8">
                <Text className="font-11 font-inter text-fg-3 m-0 max-w-[310px]">
                  Questions about billing or your plan? Reply to this email
                  and we&apos;ll help sort it out.
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

SubscriptionConfirmation.PreviewProps = {
  userName: 'Erick',
  planName: 'Pro',
  planPrice: 'KES 1,500',
  cycleLabel: 'month',
  nextBillingDate: '6 August 2026',
  subtotal: 'KES 1,293.10',
  tax: 'KES 206.90',
  total: 'KES 1,500.00',
  url: 'https://example.com/billing',
  baseUrl: '',
} satisfies SubscriptionConfirmationProps;

export default SubscriptionConfirmation;
