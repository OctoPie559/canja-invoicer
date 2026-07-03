import * as Sentry from "@sentry/nextjs";
import { scrubStrings } from "@/lib/observability/scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend(event) {
    return scrubStrings(event);
  },
  beforeBreadcrumb(breadcrumb) {
    return scrubStrings(breadcrumb);
  },
});
