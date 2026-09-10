import Link from "next/link";
import { LegalShell, List, Section, Sub } from "../legal-shell";

export const metadata = {
  title: "Terms of Service · Canja",
  description:
    "The agreement between you and Canja covering accounts, subscriptions, acceptable use, liability and termination.",
};

const UPDATED = "10 September 2026";

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated={UPDATED}
      summary="These terms are the agreement between you and Canja. They cover what you can expect from us, what we expect from you, how billing works, and what happens when things go wrong. Please read section 10 and section 12 carefully — they limit our liability."
    >
      <Section id="agreement" heading="1. This agreement">
        <p>
          These terms are between you and Syncra Technologies, a
          company registered in Kenya (registration number{" "}
          BNMJS5RQ3K) of 2nd Floor, Imara Daima, Imara Lane, Embakasi, Nairobi (P.O. Box 8765–00100, G.P.O. Nairobi, Kenya) (
          <strong>&quot;Canja&quot;</strong>, <strong>&quot;we&quot;</strong>,{" "}
          <strong>&quot;us&quot;</strong>). By creating an account or using the
          service you accept them. If you are accepting on behalf of a company,
          you confirm you are authorised to bind it.
        </p>
        <p>
          Our{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>{" "}
          forms part of this agreement.
        </p>
      </Section>

      <Section id="service" heading="2. What Canja does">
        <p>
          Canja is software for creating and sending invoices, estimates and
          credit notes, tracking payments, and collecting money from your
          customers through third-party payment providers.
        </p>
        <p>
          <strong>We are not a bank, a payment service provider, or a licensed
          financial institution.</strong> Payments are handled by Paystack and
          the underlying mobile-money and card networks under their own terms.
          We never hold your money.
        </p>
        <p>
          <strong>We do not give tax, accounting or legal advice.</strong> Canja
          helps you produce documents and records, but you remain responsible
          for whether those documents meet your obligations — including KRA
          requirements, eTIMS compliance, VAT treatment and withholding tax.
          Check with a qualified adviser.
        </p>
      </Section>

      <Section id="eligibility" heading="3. Who may use Canja">
        <p>
          You must be at least 18 and legally able to enter a contract. You may
          not use Canja if you are barred from doing so under any applicable
          sanctions or laws.
        </p>
      </Section>

      <Section id="accounts" heading="4. Your account">
        <List
          items={[
            "Give us accurate information and keep it current.",
            "Keep your credentials secret. You are responsible for everything done through your account.",
            "Tell us promptly at support@syncra.co.ke if you suspect unauthorised access.",
            "If you invite team members, you are responsible for their use of your organisation's data and for the permissions you grant them.",
          ]}
        />
      </Section>

      <Section id="plans" heading="5. Plans, billing and renewal">
        <List
          items={[
            <>
              Canja offers a free tier and a paid Pro plan. Current prices and
              what each plan includes are shown on the billing page in your
              account settings before you are charged.
            </>,
            <>
              Paid plans are billed in advance, monthly or annually as you
              choose, and renew automatically until cancelled. The Pro plan is
              KES 1,500 per month or KES 15,000 per year.
            </>,
            <>
              You can cancel at any time from your billing settings. Cancelling
              stops the next renewal; it does not refund the period you are in.
            </>,
            <>
              <strong>Refunds:</strong> if you are unhappy with a paid plan,
              tell us within 14 days of your first payment for that plan and we
              will refund it in full. After that first 14 days, payments are
              non-refundable and cancelling stops future renewals rather than
              refunding the current period. Nothing here limits any refund you
              are entitled to by law, and we may refund at our discretion where
              a fault on our side prevented you using the service.
            </>,
            <>
              If a renewal payment fails, we keep retrying for a grace period
              of three days, during which your paid features stay on. After
              that we may restrict them until payment succeeds.
            </>,
            <>
              We may change prices on 30 days’ notice. If you do not accept a change, cancel before it takes
              effect.
            </>,
            <>
              Prices are exclusive of VAT and other taxes unless stated. You are
              responsible for any taxes due on your use of the service.
            </>,
          ]}
        />
      </Section>

      <Section id="acceptable-use" heading="6. Acceptable use">
        <p>You agree not to:</p>
        <List
          items={[
            "Use Canja to send fraudulent invoices, launder money, or finance any illegal activity.",
            "Upload malware, attempt to breach our security, probe other tenants' data, or bypass rate limits and access controls.",
            "Scrape, resell, or white-label the service without our written agreement.",
            "Send unsolicited bulk email through our sending infrastructure.",
            "Impersonate anyone, or misrepresent your affiliation with a person or business.",
            "Use the service in a way that breaks the law where you or your customers are.",
          ]}
        />
        <p>
          We may investigate suspected breaches and suspend accounts while we do
          so.
        </p>
      </Section>

      <Section id="your-data" heading="7. Your data and your customers' data">
        <p>
          You keep ownership of everything you put into Canja. You grant us a
          licence to host, process, transmit and display it strictly as needed
          to run the service for you, and to keep backups.
        </p>
        <p>
          When you enter details about your own customers, you are the
          controller of that data and we process it for you. You confirm you
          have a lawful basis for providing it, and that you have given those
          people whatever privacy notice the law requires.
        </p>
        <p>
          You can export your data at any time while your account is open. On
          closure we delete or anonymise it, subject to the retention periods in
          our Privacy Policy — some financial records must be kept by law.
        </p>
      </Section>

      <Section id="ip" heading="8. Our intellectual property">
        <p>
          Canja&apos;s software, design, branding and documentation belong to us
          and our licensors. We grant you a limited, non-exclusive,
          non-transferable right to use the service under these terms. Nothing
          here transfers ownership. If you send us feedback, we may use it
          without obligation to you.
        </p>
      </Section>

      <Section id="third-parties" heading="9. Third-party services">
        <p>
          Canja relies on third parties including Paystack and our hosting and
          email providers. Their availability and their own terms
          are outside our control, and we are not liable for their acts or
          omissions beyond what the law requires of us as their customer.
        </p>
      </Section>

      <Section id="availability" heading="10. Availability and disclaimers">
        <p>
          We work to keep Canja available and correct, but we provide it{" "}
          <strong>&quot;as is&quot;</strong>. To the fullest extent the law
          allows, we exclude implied warranties of merchantability, fitness for
          a particular purpose and non-infringement.
        </p>
        <p>
          We do not warrant that the service will be uninterrupted or
          error-free, that data will never be lost, or that it will meet any
          particular regulatory requirement applicable to your business. We do
          not currently offer a service level agreement or an uptime
          commitment.
        </p>
        <Sub heading="Keep your own records" />
        <p>
          You are responsible for retaining copies of records you are legally
          required to keep. Do not rely on Canja as your only copy.
        </p>
      </Section>

      <Section id="suspension" heading="11. Suspension and termination">
        <p>
          You may close your account at any time. We may suspend or terminate
          your access if you materially breach these terms, if we are required
          to by law, if your payments fail after the grace period, or if your
          use poses a security or legal risk to us or other users. Where
          practical we will warn you first and give you a chance to fix the
          problem.
        </p>
        <p>
          On termination your right to use the service stops immediately.
          Sections 7 to 14 survive.
        </p>
      </Section>

      <Section id="liability" heading="12. Limitation of liability">
        <p>
          Nothing in these terms limits liability for death or personal injury
          caused by negligence, for fraud, or for anything else that cannot be
          limited by law.
        </p>
        <p>
          Subject to that, we are not liable for lost profits, lost revenue,
          lost business, lost goodwill, or indirect or consequential loss. Our
          total liability arising out of or relating to this agreement in any
          twelve-month period is limited to the greater of KES 10,000 and the
          fees you paid us in the twelve months before the claim arose.
        </p>
      </Section>

      <Section id="indemnity" heading="13. Indemnity">
        <p>
          You will indemnify us against claims, losses and reasonable costs
          arising from your use of the service in breach of these terms or the
          law, or from the content you send through it — including any claim by
          one of your customers about an invoice you issued.
        </p>
      </Section>

      <Section id="changes" heading="14. Changes to these terms">
        <p>
          We may update these terms. We will post the new version here and
          change the date at the top. For material changes we will give you 30
          days’ notice by email or in the app. Continuing
          to use Canja after a change takes effect means you accept it.
        </p>
      </Section>

      <Section id="law" heading="15. Governing law and disputes">
        <p>
          These terms are governed by the laws of Kenya. You and we submit to
          the exclusive jurisdiction of the courts of Kenya.
        </p>
        <p>
          If any provision is found unenforceable, the rest stays in force. Our
          failure to enforce a right is not a waiver of it. You may not assign
          this agreement without our consent; we may assign it as part of a
          merger or sale of our business.
        </p>
      </Section>

      <Section id="contact" heading="16. Contact">
        <p>
          Syncra Technologies, 2nd Floor, Imara Daima, Imara Lane, Embakasi,
          Nairobi (P.O. Box 8765–00100, G.P.O. Nairobi, Kenya).
          Questions about these terms: support@syncra.co.ke.
        </p>
      </Section>
    </LegalShell>
  );
}
