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

interface EstimateResponseEmailProps {
  /** "accepted" | "declined" */
  decision: 'accepted' | 'declined';
  displayNumber: string;
  customerName: string;
  /** formatted, e.g. "KES 3,480.00" */
  total: string;
  /** link into the app workspace for this quote */
  url: string;
  /** Absolute origin for hosted images. */
  baseUrl: string;
}

export const EstimateResponseEmail = ({
  decision,
  displayNumber,
  customerName,
  total,
  url,
  baseUrl,
}: EstimateResponseEmailProps) => {
  const accepted = decision === 'accepted';
  return (
    <Tailwind config={emailTheme}>
      <Html>
        <Head>
          <EmailFonts />
        </Head>

        <Body className="bg-canvas font-14 font-inter text-fg m-0 p-0">
          <Preview>
            {customerName} {decision} quote {displayNumber}
          </Preview>
          <Container className="mx-auto max-w-[640px] px-4 pt-16 pb-6">
            <Section className="shadow-collage-card rounded-[8px]">
              <Section className="bg-bg border-stroke rounded-[8px] border">
                <EmailLogo baseUrl={baseUrl} />

                <Section className="mobile:px-6! px-10 pt-8">
                  <Section className="mb-9">
                    <Text className="font-48 text-fg m-0 font-sans">
                      {accepted ? 'Quote accepted' : 'Quote declined'}
                    </Text>
                    <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                      <strong>{customerName}</strong> {decision} quote{' '}
                      <strong>{displayNumber}</strong> ({total}).
                      {accepted
                        ? ' You can convert it into an invoice whenever you’re ready.'
                        : ' No further action is needed.'}
                    </Text>
                  </Section>

                  <Button
                    href={url}
                    className="bg-brand font-15 font-inter text-fg-inverted inline-block border-none px-5 py-3.5 text-center"
                  >
                    {accepted ? 'Convert to invoice' : 'View quote'}
                  </Button>
                </Section>

                <Section className="mobile:px-6! px-10 pt-16 pb-8">
                  <Text className="font-11 font-inter text-fg-3 m-0 max-w-[310px]">
                    You received this because a customer responded to a quote on
                    your Canja account.
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
};

EstimateResponseEmail.PreviewProps = {
  decision: 'accepted',
  displayNumber: 'EST-000007',
  customerName: 'Acme Ltd',
  total: 'KES 3,480.00',
  url: 'https://example.com/orgs/o/estimates/e',
  baseUrl: '',
} satisfies EstimateResponseEmailProps;

export default EstimateResponseEmail;
