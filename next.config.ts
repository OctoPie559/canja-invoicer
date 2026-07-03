import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {};

// Source-map upload activates only when SENTRY_AUTH_TOKEN is configured;
// otherwise this wrapper is a no-op and local/CI builds stay self-contained.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  disableLogger: true,
});
