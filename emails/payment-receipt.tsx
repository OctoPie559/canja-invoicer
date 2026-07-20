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

interface PaymentReceiptEmailProps {
  organizationName: string;
  displayNumber: string;
  /** formatted amount received, e.g. "KES 3,480.00" */
  amountPaid: string;
  /** formatted, e.g. "KES 0.00" */
  balance: string;
  paidDate: string;
  /** hosted public view link */
  url: string;
  /** Absolute origin for hosted images. */
  baseUrl: string;
}

export const PaymentReceiptEmail = ({
  organizationName,
  displayNumber,
  amountPaid,
  balance,
  paidDate,
  url,
  baseUrl,
}: PaymentReceiptEmailProps) => (
  <Tailwind config={emailTheme}>
    <Html>
      <Head>
        <EmailFonts />
      </Head>

      <Body className="bg-canvas font-14 font-inter text-fg m-0 p-0">
        <Preview>
          Payment received for {displayNumber} — {amountPaid}
        </Preview>
        <Container className="mx-auto max-w-[640px] px-4 pt-16 pb-6">
          <Section className="shadow-collage-card rounded-[8px]">
            <Section className="bg-bg border-stroke rounded-[8px] border">
              <EmailLogo baseUrl={baseUrl} />

              <Section className="mobile:px-6! px-10 pt-8">
                <Section className="mb-9">
                  <Text className="font-48 text-fg m-0 font-sans">
                    Payment received
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                    Thank you — your payment on invoice{' '}
                    <strong>{displayNumber}</strong> from {organizationName} was
                    received. Keep this email as your receipt.
                  </Text>
                </Section>

                <Section className="border-stroke mb-9 rounded-[6px] border">
                  <Row>
                    <Column className="p-4">
                      <Text className="font-11 font-inter text-fg-3 m-0 uppercase tracking-wide">
                        Amount paid
                      </Text>
                      <Text className="font-20 text-fg m-0 mt-1 font-sans font-medium">
                        {amountPaid}
                      </Text>
                    </Column>
                    <Column className="p-4" align="right">
                      <Text className="font-11 font-inter text-fg-3 m-0 uppercase tracking-wide">
                        Paid on
                      </Text>
                      <Text className="font-20 text-fg m-0 mt-1 font-sans font-medium">
                        {paidDate}
                      </Text>
                    </Column>
                  </Row>
                  <Row>
                    <Column className="border-stroke border-t p-4">
                      <Text className="font-11 font-inter text-fg-3 m-0 uppercase tracking-wide">
                        Balance remaining
                      </Text>
                      <Text className="font-20 text-fg m-0 mt-1 font-sans font-medium">
                        {balance}
                      </Text>
                    </Column>
                  </Row>
                </Section>

                <Button
                  href={url}
                  className="bg-brand font-15 font-inter text-fg-inverted inline-block border-none px-5 py-3.5 text-center"
                >
                  View invoice
                </Button>
              </Section>

              <Section className="mobile:px-6! px-10 pt-16 pb-8">
                <Text className="font-11 font-inter text-fg-3 m-0 max-w-[310px]">
                  Questions about this payment? Reply to this email to reach{' '}
                  {organizationName} directly.
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

PaymentReceiptEmail.PreviewProps = {
  organizationName: 'Njogu-ini Studios',
  displayNumber: 'INV-000042',
  amountPaid: 'KES 3,480.00',
  balance: 'KES 0.00',
  paidDate: '2026-07-19',
  url: 'https://example.com/i/token',
  baseUrl: '',
} satisfies PaymentReceiptEmailProps;

export default PaymentReceiptEmail;
