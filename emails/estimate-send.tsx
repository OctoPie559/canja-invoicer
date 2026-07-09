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

interface EstimateSendEmailProps {
  organizationName: string;
  displayNumber: string;
  /** formatted, e.g. "KES 3,480.00" */
  total: string;
  /** formatted expiry date, or empty */
  validUntil: string;
  /** hosted public quote link (view + accept/decline) */
  url: string;
  /** Absolute origin for hosted images. */
  baseUrl: string;
}

export const EstimateSendEmail = ({
  organizationName,
  displayNumber,
  total,
  validUntil,
  url,
  baseUrl,
}: EstimateSendEmailProps) => (
  <Tailwind config={emailTheme}>
    <Html>
      <Head>
        <EmailFonts />
      </Head>

      <Body className="bg-canvas font-14 font-inter text-fg m-0 p-0">
        <Preview>
          Quote {displayNumber} from {organizationName} — {total}
        </Preview>
        <Container className="mx-auto max-w-[640px] px-4 pt-16 pb-6">
          <Section className="shadow-collage-card rounded-[8px]">
            <Section className="bg-bg border-stroke rounded-[8px] border">
              <EmailLogo baseUrl={baseUrl} />

              <Section className="mobile:px-6! px-10 pt-8">
                <Section className="mb-9">
                  <Text className="font-48 text-fg m-0 font-sans">
                    You have a quote
                  </Text>
                  <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                    {organizationName} sent you quote{' '}
                    <strong>{displayNumber}</strong>. Review the details and
                    let them know if you&apos;d like to go ahead — you can
                    accept or decline right from the page.
                  </Text>
                </Section>

                <Section className="border-stroke mb-9 rounded-[6px] border">
                  <Row>
                    <Column className="p-4">
                      <Text className="font-11 font-inter text-fg-3 m-0 uppercase tracking-wide">
                        Quote total
                      </Text>
                      <Text className="font-20 text-fg m-0 mt-1 font-sans font-medium">
                        {total}
                      </Text>
                    </Column>
                    {validUntil ? (
                      <Column className="p-4" align="right">
                        <Text className="font-11 font-inter text-fg-3 m-0 uppercase tracking-wide">
                          Valid until
                        </Text>
                        <Text className="font-20 text-fg m-0 mt-1 font-sans font-medium">
                          {validUntil}
                        </Text>
                      </Column>
                    ) : null}
                  </Row>
                </Section>

                <Button
                  href={url}
                  className="bg-brand font-15 font-inter text-fg-inverted inline-block border-none px-5 py-3.5 text-center"
                >
                  View &amp; respond
                </Button>
              </Section>

              <Section className="mobile:px-6! px-10 pt-16 pb-8">
                <Text className="font-11 font-inter text-fg-3 m-0 max-w-[310px]">
                  Questions about this quote? Reply to this email to reach{' '}
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

EstimateSendEmail.PreviewProps = {
  organizationName: 'Njogu-ini Studios',
  displayNumber: 'EST-000007',
  total: 'KES 3,480.00',
  validUntil: '2026-08-07',
  url: 'https://example.com/e/token',
  baseUrl: '',
} satisfies EstimateSendEmailProps;

export default EstimateSendEmail;
