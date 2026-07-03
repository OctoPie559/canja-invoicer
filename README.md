# invoicer

Kenya-first invoicing & payments platform for freelancers and small teams.
Working name; see [PROJECT_BRIEF.md](./PROJECT_BRIEF.md) (what/why) and
[ARCHITECTURE.md](./ARCHITECTURE.md) (how) — read both before writing code.

## Stack

Next.js 15 (App Router) · PostgreSQL on Neon · Drizzle · Better Auth · Zod ·
Resend · Sentry · Vitest (+ PGlite for integration tests). Money is `bigint`
minor units through the `Money` value object; every mutation is audited in
its own transaction; tenant isolation is enforced in the service layer with
Postgres RLS as a backstop.

## Local development

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL + BETTER_AUTH_SECRET
npm run db:migrate          # apply migrations to your Neon branch
npm run dev
```

Without `RESEND_API_KEY`, emails (verification, invitations, resets) are
logged to the console instead of sent — check the dev server output for the
links.

## Tests

```bash
npm test              # unit + integration; integration runs on in-process
                      # real Postgres (PGlite) incl. RLS and audit guards
npm run typecheck
npm run lint
```

## Deployment (one-time setup)

1. **Neon**: create a project; copy the pooled connection string into
   `DATABASE_URL`. Run `npm run db:migrate` against it. The migration creates
   the `invoicer_app` role (RLS backstop) — the connection role needs
   `CREATEROLE`, which Neon's default role has.
2. **Vercel**: import the repo, set env vars from `.env.example`
   (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` = production URL).
3. **Resend** (before slice 3): add a dedicated sending subdomain
   (e.g. `send.yourdomain.co.ke`), configure SPF/DKIM/DMARC, then set
   `RESEND_API_KEY` and `EMAIL_FROM`.
4. **Sentry**: already wired to the project DSN (baked into the configs;
   override per environment via `SENTRY_DSN` /
   `NEXT_PUBLIC_SENTRY_DSN`). For source maps set `SENTRY_ORG`,
   `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.

## Working conventions

One branch per slice (`slice-0-foundation`, …); a slice merges to `main`
only when its tests pass and the slice-verifier agent issues a PASS
(hook-enforced — see [CLAUDE.md](./CLAUDE.md)). Delivery plan and status:
ARCHITECTURE.md §8.
