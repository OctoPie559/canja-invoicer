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

interface InvoiceReminderEmailProps {
  organizationName: string;
  displayNumber: string;
  /** formatted current balance due, e.g. "KES 3,480.00" */
  balanceDue: string;
  dueDate: string;
  /** 0 when not yet past due */
  daysOverdue: number;
  /** hosted public invoice view */
  url: string;
  /** Absolute origin for hosted images. */
  baseUrl: string;
}

export const InvoiceReminderEmail = ({
  organizationName,
  displayNumber,
  balanceDue,
  dueDate,
  daysOverdue,
  url,
  baseUrl,
}: InvoiceReminderEmailProps) => {
  const overdue = daysOverdue > 0;
  return (
    <Tailwind config={emailTheme}>
      <Html>
        <Head>
          <EmailFonts />
        </Head>

        <Body className="bg-canvas font-14 font-inter text-fg m-0 p-0">
          <Preview>
            Reminder: invoice {displayNumber} — {balanceDue} due
          </Preview>
          <Container className="mx-auto max-w-[640px] px-4 pt-16 pb-6">
            <Section className="shadow-collage-card rounded-[8px]">
              <Section className="bg-bg border-stroke rounded-[8px] border">
                <EmailLogo baseUrl={baseUrl} />

                <Section className="mobile:px-6! px-10 pt-8">
                  <Section className="mb-9">
                    <Text className="font-48 text-fg m-0 font-sans">
                      Payment reminder
                    </Text>
                    <Text className="font-14 font-inter text-fg-2 m-0 mt-[18px]">
                      A friendly reminder from {organizationName} about invoice{' '}
                      <strong>{displayNumber}</strong>.
                      {overdue
                        ? ` It is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} past due.`
                        : ' Payment is due soon.'}
                    </Text>
                  </Section>

                  <Section className="border-stroke mb-9 rounded-[6px] border">
                    <Row>
                      <Column className="p-4">
                        <Text className="font-11 font-inter text-fg-3 m-0 uppercase tracking-wide">
                          Balance due
                        </Text>
                        <Text className="font-20 text-fg m-0 mt-1 font-sans font-medium">
                          {balanceDue}
                        </Text>
                      </Column>
                      <Column className="p-4" align="right">
                        <Text className="font-11 font-inter text-fg-3 m-0 uppercase tracking-wide">
                          Due date
                        </Text>
                        <Text className="font-20 text-fg m-0 mt-1 font-sans font-medium">
                          {dueDate}
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
                  <Text className="font-11 font-inter text-fg-3 m-0 max-w-[330px]">
                    If you have already paid, please disregard this reminder —
                    or reply to this email to reach {organizationName}.
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

InvoiceReminderEmail.PreviewProps = {
  organizationName: 'Njogu-ini Studios',
  displayNumber: 'INV-000002',
  balanceDue: 'KES 3,480.00',
  dueDate: '2026-07-08',
  daysOverdue: 1,
  url: 'https://example.com/i/token',
  baseUrl: '',
} satisfies InvoiceReminderEmailProps;

export default InvoiceReminderEmail;
