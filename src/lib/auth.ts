import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db/client";
import {
  account,
  rateLimit,
  session,
  user,
  verification,
} from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { getEmailSender } from "@/lib/email/port";
import {
  passwordResetEmail,
  verificationEmail,
} from "@/lib/email/templates";

/**
 * Better Auth handles AUTHENTICATION only: users, sessions, credentials,
 * email verification, password reset (ARCHITECTURE.md §10). Organizations,
 * members, and invitations are OUR domain — managed in lib/services with
 * audit rows in the same transaction, which Better Auth's org plugin could
 * not guarantee. Tables stay stock; app data lives in our own tables.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user, session, account, verification, rateLimit },
  }),
  advanced: {
    database: {
      // UUIDv7 everywhere (PROJECT_BRIEF.md §5.2)
      generateId: () => newId(),
    },
  },
  emailAndPassword: {
    enabled: true,
    // login is allowed pre-verification; SENDING INVOICES is what the
    // verification gate protects (brief §6), enforced in the send service
    requireEmailVerification: false,
    sendResetPassword: async ({ user: u, url }) => {
      await getEmailSender().send({
        to: u.email,
        ...(await passwordResetEmail({ url })),
      });
    },
    // brief §6: sessions are revoked on password change
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user: u, url }) => {
      await getEmailSender().send({
        to: u.email,
        ...(await verificationEmail({ name: u.name, url })),
      });
    },
  },
  rateLimit: {
    // brief §6: rate limiting on login and password reset. Storage must be
    // the database — in-memory counters are per-instance on serverless and
    // would silently not throttle in production.
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 10,
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
