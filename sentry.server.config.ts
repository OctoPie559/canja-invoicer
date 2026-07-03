import * as Sentry from "@sentry/nextjs";
import { scrubStrings } from "@/lib/observability/scrub";

// Inert without a DSN (local dev, CI). MSISDNs are masked in every outbound
// event and breadcrumb — Kenya DPA 2019 (PROJECT_BRIEF.md §7).
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
