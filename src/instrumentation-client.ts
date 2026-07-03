// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";
import { scrubStrings } from "@/lib/observability/scrub";

Sentry.init({
  // env-first so CI/forks/other envs can point elsewhere or disable ("");
  // falls back to this project's DSN (public by design — ships in bundles)
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ??
    "https://ccdfab1b34714ca57a28d6b0303d9a01@o4508081485578240.ingest.de.sentry.io/4511670013329488",
  // Enable logs to be sent to Sentry
  enableLogs: true,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },

  // MSISDNs must never leave the system unmasked — Kenya DPA 2019
  // (PROJECT_BRIEF.md §5.2/§7). Applies to every outbound event/breadcrumb.
  beforeSend(event) {
    return scrubStrings(event);
  },
  beforeBreadcrumb(breadcrumb) {
    return scrubStrings(breadcrumb);
  },
  beforeSendLog(log) {
    return scrubStrings(log);
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;