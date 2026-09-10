import { LegalShell, List, Section, Sub } from "../legal-shell";

export const metadata = {
  title: "Privacy Policy · Canja",
  description:
    "How Canja collects, uses, shares and protects personal data.",
};

const UPDATED = "10 September 2026";

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated={UPDATED}
      summary="This policy explains what personal data Canja handles, why, who we share it with, and the rights you have over it."
    >
      <Section id="who-we-are" heading="1. Who we are">
        <p>
          Canja is an invoicing and payments platform operated by{" "}
          Syncra Technologies, a company registered in Kenya
          (registration number BNMJS5RQ3K) with its
          registered office at 2nd Floor, Imara Daima, Imara Lane, Embakasi, Nairobi (P.O. Box 8765–00100, G.P.O. Nairobi, Kenya).
        </p>
        <p>
          For the purposes of the Kenya Data Protection Act, 2019 (the{" "}
          <strong>DPA</strong>) and the EU/UK General Data Protection Regulation
          (<strong>GDPR</strong>), we are the data controller for the data
          described in this policy, except where section 3 says we act as a
          processor on your behalf.
        </p>
        <p>
          Data protection contact: support@syncra.co.ke. We have not appointed
          a Data Protection Officer; data protection enquiries go to that
          address.
        </p>
      </Section>

      <Section id="scope" heading="2. Who this policy covers">
        <p>This policy applies to three groups of people:</p>
        <List
          items={[
            <>
              <strong>Account holders</strong> — the freelancers, business
              owners and team members who sign in to Canja.
            </>,
            <>
              <strong>Your customers and contacts</strong> — the people whose
              details account holders enter in order to send invoices. For this
              data we are usually a processor, not a controller (section 3).
            </>,
            <>
              <strong>Visitors</strong> — anyone who opens our website or a
              hosted invoice link without an account.
            </>,
          ]}
        />
      </Section>

      <Section id="roles" heading="3. Controller and processor: which is which">
        <p>
          We are the <strong>controller</strong> for your account, your
          organisation&apos;s own details, billing, security logs and support.
        </p>
        <p>
          We are a <strong>processor</strong> for the personal data you enter
          about your own customers and contacts — their names, email addresses,
          phone numbers, postal addresses, KRA PINs and the contents of the
          invoices you address to them. You decide what to collect and why; we
          store and process it on your instructions. You are responsible for
          having a lawful basis to give us that data, and for your own privacy
          notice to the people it describes.
        </p>
      </Section>

      <Section id="what-we-collect" heading="4. What we collect">
        <Sub heading="Account and organisation data" />
        <List
          items={[
            "Your name, email address, and a hashed password (we never store the password itself).",
            "Your organisation's legal name, trading name, postal address, KRA PIN, logo, currency and invoicing preferences.",
            "Your role and membership in an organisation, and invitations you send or accept.",
          ]}
        />

        <Sub heading="Business records you create" />
        <List
          items={[
            "Invoices, estimates, credit notes, recurring schedules, products, tax rates and payment records.",
            "Customer and contact records, including names, emails, phone numbers, billing and shipping addresses, and KRA PINs.",
            "Comments and notes you add to documents.",
          ]}
        />

        <Sub heading="Payment data" />
        <p>
          Payments are processed by Paystack. We do not receive or store full
          card numbers or M-Pesa PINs. We store the transaction reference,
          amount, currency, status, channel, and where you have saved a payment
          method for recurring billing, the reusable token Paystack issues.
        </p>

        <Sub heading="Communications" />
        <List
          items={[
            "Emails we send on your behalf or to you, and delivery metadata such as whether a message was delivered, bounced or failed.",
            "Anything you send us through support channels.",
          ]}
        />

        <Sub heading="Ask Canja (AI feature)" />
        <p>
          If you use the Ask feature, your question and the relevant excerpts of
          your own business records are sent to OpenAI to generate an answer. We
          store the conversation and a token-usage log. Ask is read-only over
          your data — it cannot change your records.
        </p>

        <Sub heading="Technical and security data" />
        <List
          items={[
            "IP address, browser user-agent, and session identifiers.",
            "An append-only audit log of every change made to your records: who did what, when, and from which IP address.",
            "Error diagnostics captured by Sentry when something breaks. Phone numbers are masked before they reach our logs or error reports.",
          ]}
        />

        <Sub heading="Support widget" />
        <p>
          Our website loads a support widget (Ansera) served from{" "}
          <code>ansera-cdn.syncra.co.ke</code>, which is our own infrastructure
          rather than a third party&apos;s. It can see your IP address, the page
          you are on, and anything you type into it.
        </p>
        <p>
          The widget does not set cookies. It stores a conversation reference in
          your browser&apos;s local storage so a chat you start survives a page
          reload; you can clear it through your browser&apos;s site-data
          settings. We keep the transcript of your conversation so we can
          follow up on your question and improve our support.
        </p>
      </Section>

      <Section id="why" heading="5. Why we use your data, and our legal basis">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 font-medium">Purpose</th>
                <th className="py-2 font-medium">Legal basis</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {[
                ["Providing the service you signed up for", "Performance of a contract"],
                ["Billing, and collecting what you owe us", "Performance of a contract"],
                ["Fraud prevention and platform security", "Legitimate interests; legal obligation"],
                ["Keeping financial and audit records", "Legal obligation (including tax law)"],
                ["Service emails you cannot opt out of, such as security alerts", "Performance of a contract"],
                ["Marketing emails, if you have asked for them", "Consent"],
                ["Improving and debugging the product", "Legitimate interests"],
              ].map(([purpose, basis]) => (
                <tr key={purpose} className="border-b last:border-0">
                  <td className="py-2 pr-4">{purpose}</td>
                  <td className="py-2 text-muted-foreground">{basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Where we rely on legitimate interests, we have considered whether
          those interests are overridden by your rights, and you may object at
          any time (section 9).
        </p>
      </Section>

      <Section id="sharing" heading="6. Who we share data with">
        <p>
          We do not sell personal data, and we do not share it for
          cross-context behavioural advertising. We use the following service
          providers, each bound by a contract that limits them to our
          instructions:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 font-medium">Provider</th>
                <th className="py-2 pr-4 font-medium">Purpose</th>
                <th className="py-2 font-medium">Location</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {[
                ["Neon", "Database hosting", "London, United Kingdom"],
                ["Vercel", "Application hosting", "United States / global edge"],
                ["Cloudflare R2", "File and document storage", "Global"],
                ["Paystack", "Payment processing", "Nigeria / South Africa"],
                ["Resend", "Transactional email delivery", "United States"],
                ["OpenAI", "Ask Canja answers and search indexing", "United States"],
                ["Sentry", "Error monitoring", "United States"],
                ["Ansera (our own)", "In-product support widget", "Kenya"],
              ].map(([name, purpose, location]) => (
                <tr key={name} className="border-b last:border-0">
                  <td className="py-2 pr-4">{name}</td>
                  <td className="py-2 pr-4">{purpose}</td>
                  <td className="py-2 text-muted-foreground">{location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          We may also disclose data where the law requires it, to establish or
          defend legal claims, or to a buyer in connection with a sale or
          restructuring of our business — in which case we will tell you before
          your data becomes subject to a different privacy policy.
        </p>
      </Section>

      <Section id="transfers" heading="7. Sending data outside Kenya">
        <p>
          Your data is stored outside Kenya. Our database is hosted in
          London, United Kingdom, and several of our other providers are in the
          European Union or the United States, so your data is transferred
          abroad in the ordinary course of running the service. Sections 48 and 49 of the DPA permit this where
          appropriate safeguards exist and, for sensitive personal data, where
          you have given consent or another lawful ground applies. For transfers
          out of the EEA or UK, we and our providers rely on Standard
          Contractual Clauses or an adequacy decision.
        </p>
        <p>
          You may request a copy of the safeguards we rely on by writing to{" "}
          support@syncra.co.ke.
        </p>
      </Section>

      <Section id="retention" heading="8. How long we keep data">
        <List
          items={[
            <>
              <strong>Account data</strong> — for as long as your account is
              open, then deleted or anonymised within 90 days of closure.
            </>,
            <>
              <strong>Invoices, payments and other financial records</strong> —
              retained for seven years. The Tax Procedures Act, 2015 requires
              a minimum of five years; we keep seven so records survive a late
              audit. These are retained even after you close your account.
            </>,
            <>
              <strong>Audit logs</strong> — seven years, matching the financial
              records they evidence. The log is append-only and cannot be
              edited, including by us.
            </>,
            <>
              <strong>Error diagnostics</strong> — 90 days.
            </>,
            <>
              <strong>Session and technical logs</strong> — 12 months.
            </>,
            <>
              <strong>Support chat transcripts</strong> — 12 months from your
              last message in the conversation.
            </>,
          ]}
        />
      </Section>

      <Section id="rights" heading="9. Your rights">
        <p>
          Under the DPA and the GDPR you may ask us to give you a copy of your
          data, correct it, delete it, restrict how we use it, or send it to
          another provider in a portable format. You may object to processing
          based on legitimate interests, and withdraw any consent you have given
          without affecting processing that already happened.
        </p>
        <p>
          Some of these rights have limits. We cannot delete records we are
          legally required to keep, such as issued invoices and their audit
          trail.
        </p>
        <Sub heading="If you are in California" />
        <p>
          You may request disclosure of the categories and specific pieces of
          personal information we have collected, request deletion or
          correction, and are entitled not to be discriminated against for
          exercising those rights. <strong>We do not sell or share personal
          information</strong> as those terms are defined by the CCPA/CPRA, and
          we have not done so in the preceding twelve months.
        </p>
        <p>
          To exercise any right, write to support@syncra.co.ke.
          We will respond within the time the applicable law allows, and we may
          need to verify your identity first.
        </p>
      </Section>

      <Section id="security" heading="10. How we protect data">
        <List
          items={[
            "Every record is scoped to a single organisation, enforced in the database as well as in the application, so one tenant cannot read another's data.",
            "Every change is written to an append-only audit log in the same transaction as the change itself.",
            "Passwords are hashed. Card details never reach our servers.",
            "Phone numbers are masked before being written to logs or error reports.",
            "Data is encrypted in transit, and at rest by our hosting providers.",
          ]}
        />
        <p>
          No system is perfectly secure. If a breach affects your rights and
          freedoms, we will notify the ODPC and, where required, you — within
          72 hours of becoming aware, as the DPA and GDPR require.
        </p>
      </Section>

      <Section id="children" heading="11. Children">
        <p>
          Canja is for business use and is not directed at children. We do not
          knowingly collect data from anyone under 18. If you believe a child
          has given us data, contact us and we will delete it.
        </p>
      </Section>

      <Section id="changes" heading="12. Changes to this policy">
        <p>
          We will post any changes on this page and update the date at the top.
          If a change materially affects your rights, we will tell you directly
          before it takes effect.
        </p>
      </Section>

      <Section id="complaints" heading="13. Complaints">
        <p>
          Please raise concerns with us first at{" "}
          support@syncra.co.ke. You also have the right to
          complain to the Office of the Data Protection Commissioner of Kenya
          (odpc.go.ke), or — if you are in the EEA or UK — to your local
          supervisory authority.
        </p>
      </Section>
    </LegalShell>
  );
}
