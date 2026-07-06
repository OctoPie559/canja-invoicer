/**
 * Render smoke-check for transactional email templates.
 *
 * Emails render server-side; a broken template only surfaces at send time.
 * `npm run email:check` renders each one and asserts it produces HTML + a
 * plain-text fallback with the right copy, the brand logo, and no leftover
 * placeholder branding. Kept as a script rather than a Vitest test because
 * Vitest 4's rolldown SSR transform does not parse the templates' JSX
 * without a bundler plugin that conflicts with its own dependency tree.
 */
import { render } from "@react-email/render";
import { InvitationEmail } from "../emails/invitation";
import { PasswordResetEmail } from "../emails/password-reset";
import { SubscriptionConfirmation } from "../emails/subscription-confirmation";
import { SubscriptionUpdate } from "../emails/subscription-update";
import { VerificationEmail } from "../emails/verification";

let failed = false;

function assert(label: string, html: string, text: string, must: string[]) {
  const missing = must.filter((m) => !html.includes(m));
  const hasPlaceholder = html.includes("Collage");
  const ok = missing.length === 0 && !hasPlaceholder && text.length > 30;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label} (html ${html.length}, text ${text.length})`,
  );
  if (!ok) {
    failed = true;
    if (missing.length) console.log(`   missing: ${missing.join(", ")}`);
    if (hasPlaceholder) console.log("   leftover placeholder branding");
    if (text.length <= 30) console.log("   plain-text fallback too short");
  }
}

async function renderBoth(node: React.ReactElement) {
  return {
    html: await render(node),
    text: await render(node, { plainText: true }),
  };
}

async function main() {
  const v = await renderBoth(
    <VerificationEmail name="Erick" url="https://app.example/verify" baseUrl="" />,
  );
  assert("verification", v.html, v.text, [
    "Erick",
    "invoicer",
    "verify",
    "static/color-logo.png",
  ]);

  // send path: with a real base URL the logo must be an absolute hosted URL
  // (email clients fetch images through their own proxies — relative paths
  // and localhost never resolve there)
  const vHosted = await renderBoth(
    <VerificationEmail
      name="Erick"
      url="https://app.example/verify"
      baseUrl="https://assets.example"
    />,
  );
  assert("verification (hosted logo)", vHosted.html, vHosted.text, [
    'src="https://assets.example/static/color-logo.png"',
  ]);

  const p = await renderBoth(
    <PasswordResetEmail url="https://app.example/reset" baseUrl="" />,
  );
  assert("password reset", p.html, p.text, [
    "invoicer",
    "reset",
    "static/color-logo.png",
  ]);

  const i = await renderBoth(
    <InvitationEmail
      inviterName="Erick Ngure"
      organizationName="Njogu-ini Career Association"
      role="member"
      url="https://app.example/invitations/1"
      baseUrl=""
    />,
  );
  assert("invitation", i.html, i.text, [
    "Erick Ngure",
    "Njogu-ini Career Association",
    "member",
    "static/color-logo.png",
  ]);

  // slice-8 billing templates: rebranded and render-checked now, wired to
  // send functions when Paystack billing lands
  const sc = await renderBoth(
    <SubscriptionConfirmation
      userName="Erick"
      planName="Pro"
      planPrice="KES 1,500"
      cycleLabel="month"
      nextBillingDate="6 August 2026"
      subtotal="KES 1,293.10"
      tax="KES 206.90"
      total="KES 1,500.00"
      url="https://app.example/billing"
      baseUrl=""
    />,
  );
  assert("subscription confirmation", sc.html, sc.text, [
    "Erick",
    "Pro",
    "KES 1,500",
    "Subscription confirmed",
    "static/color-logo.png",
  ]);

  const su = await renderBoth(
    <SubscriptionUpdate
      userName="Erick"
      planName="Pro"
      planPrice="KES 1,500"
      cycleLabel="month"
      nextBillingDate="6 August 2026"
      url="https://app.example/billing"
      baseUrl=""
    />,
  );
  assert("subscription update", su.html, su.text, [
    "Erick",
    "Pro",
    "Plan renewed",
    "static/color-logo.png",
  ]);

  if (failed) {
    console.error("\nEmail render check FAILED");
    process.exit(1);
  }
  console.log("\nAll email templates render cleanly.");
}

main().catch((error) => {
  console.error("Email render check crashed:", error);
  process.exit(1);
});
