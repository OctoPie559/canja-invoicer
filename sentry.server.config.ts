// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { scrubStrings } from "@/lib/observability/scrub";

Sentry.init({
  dsn: "https://ccdfab1b34714ca57a28d6b0303d9a01@o4508081485578240.ingest.de.sentry.io/4511670013329488",

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
