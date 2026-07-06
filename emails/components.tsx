import { Img, Section, Text } from 'react-email';

/**
 * Shared brand pieces for transactional emails. These are TRANSACTIONAL
 * messages (verification, resets, invitations) — no unsubscribe links, no
 * marketing footers; recipients get them because of account activity.
 */

export const BRAND_BLURB =
  'invoicer helps Kenyan freelancers and small teams send professional invoices, get paid the way their clients actually pay, and keep a trustworthy record of every shilling.';

export function EmailLogo({ baseUrl }: { baseUrl: string }) {
  return (
    <Section className="mobile:px-6! px-10 pt-16">
      <Img
        src={`${baseUrl}/logo_assets/color-logo.png`}
        alt="invoicer"
        width={148}
        height={45}
        className="block border-none"
      />
    </Section>
  );
}

export function EmailFooter() {
  return (
    <Section className="border-stroke border-t px-10 py-10">
      <Text className="font-13 font-inter text-fg-3 m-0 max-w-[360px]">
        {BRAND_BLURB}
      </Text>
      <Text className="font-11 font-inter text-fg-2 m-0 mt-5">
        You received this email because of activity on your invoicer account.
      </Text>
    </Section>
  );
}
