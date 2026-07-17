# Canja — Architecture & Delivery Plan

> **Name:** **Canja** — a Lojban word for barter trade.
> **Companion to:** [PROJECT_BRIEF.md](./PROJECT_BRIEF.md), which is the source of truth for *what* and *why*. This document is the source of truth for *how*: concrete structure, schema, patterns, and the slice-by-slice execution plan.
> **Status:** Living document. When a decision here changes, update this file in the same session as the change.

---

## 1. System overview

A multi-tenant Next.js 15 (App Router) monolith deployed on Vercel, backed by PostgreSQL on Neon via Drizzle ORM. All business logic lives in a pure, framework-agnostic service layer; Next.js Server Actions and route handlers are thin transport wrappers. Kenya-first: KES base currency by default, M-Pesa-native payment collection (post-launch, behind a provider interface), phone numbers treated as personal data.

```
Browser / Email link / Webhook
        │
        ▼
Next.js App Router (Vercel)
  ├── Pages & Server Components ──── read paths (query helpers, org-scoped)
  ├── Server Actions ─────────────── mutations → services
  └── Route handlers ─────────────── webhooks, public invoice view, PDF, cron
        │
        ▼
lib/services  (pure TypeScript — no Next.js/Vercel imports)
  │   every mutation: validate (Zod) → authorize (role + entitlement)
  │   → execute in one DB transaction → write audit_log in same transaction
  ▼
Drizzle → Neon Postgres (RLS as tenant-isolation backstop)

Side effects (called from services via injected ports):
  Resend (email) · R2 (files) · @react-pdf/renderer (PDF)
  PaymentProvider interface (Paystack first) · Sentry (errors, MSISDNs masked)
Scheduled: Vercel Cron (overdue marking, recurring generation, reminders)
```

### 1.1 Layering rules

1. **`lib/services` is pure.** No imports from `next/*`, `@vercel/*`, or anything transport-specific. Services receive a transaction handle and an actor context; they return plain data or throw typed domain errors. This is what keeps the future offline/desktop port and any backend extraction cheap.
2. **Server Actions and route handlers are thin.** They authenticate, build the actor context, call one service function, and map the result/error to the transport. No business logic, no direct DB writes.
3. **Reads may bypass services** (Server Components can use org-scoped query helpers directly), but **writes never do**. Every mutation goes through a service so validation, permissions, entitlements, and audit are impossible to skip.
4. **Side effects go through ports.** Email, storage, PDF, and payments are interfaces defined in the domain and implemented in adapters, so services stay testable and provider-swappable.

### 1.2 The mutation pipeline

Every write follows the same shape. This is the single most important pattern in the codebase:

```ts
// inside lib/services/*
async function issueInvoice(ctx: ActorContext, input: IssueInvoiceInput) {
  const data = issueInvoiceSchema.parse(input);          // 1. Zod, server-side, always
  await authorize(ctx, "invoice.issue");                 // 2. role check, org-scoped
  await checkEntitlement(ctx.organizationId, ...);       // 3. plan gate, server-side
  return db.transaction(async (tx) => {
    // 4. load + domain rules (optimistic-lock version check, status transition rules)
    // 5. mutate (assign display number, take snapshot, set status)
    await writeAudit(tx, ctx, {                          // 6. same transaction, no exceptions
      action: "invoice.issued", entityType: "invoice", entityId, changes, reason,
    });
  });
}
```

`ActorContext` (user or system or api_key, organization id, IP, user agent, request id) is threaded via `AsyncLocalStorage` from the transport wrapper, so audit attribution is automatic and impossible to forget.

---

## 2. Repository layout

```
src/
  app/                       # Next.js App Router — thin transport layer only
    (auth)/                  # signup, login, verify, reset
    (app)/                   # authenticated app: dashboard, invoices, customers, ...
    i/[token]/               # hosted public invoice view (unauthenticated, tokenized)
    api/
      webhooks/              # payment provider callbacks (idempotent)
      cron/                  # Vercel Cron endpoints (overdue, recurring, reminders)
  lib/
    db/
      schema/                # Drizzle schema, one file per domain area
      migrations/            # Drizzle-kit migrations (incl. RLS policies, audit REVOKEs)
      client.ts              # db client + transaction helper
    services/                # ALL business logic. Pure. One module per aggregate:
                             # customers, products, invoices, estimates, credit-notes,
                             # payments, recurring, organizations, members, reporting
    domain/
      money.ts               # Money value object (see §4)
      errors.ts              # typed domain errors
      ids.ts                 # UUIDv7 generation
    audit/                   # writeAudit, ActorContext + AsyncLocalStorage plumbing
    authz/                   # role permission matrix + entitlement checks
    auth.ts                  # Better Auth configuration (+ organization plugin)
    validation/              # Zod schemas, shared client/server
    payments/
      provider.ts            # PaymentProvider interface
      paystack/              # first implementation (slice 8)
    email/                   # Resend adapter + React Email templates
    pdf/                     # @react-pdf/renderer invoice templates
    storage/                 # R2 adapter (logos, generated PDFs)
  components/                # UI components (client-side role checks are UX only)
    ui/                      # shadcn/ui primitives (radix-lyra style) — add via
                             # `npx shadcn add <component>`; build screens from these
tests/
  services/                  # Vitest — money math, status transitions, snapshots
  isolation/                 # the explicit cross-tenant isolation tests (§9 of brief)
```

---

## 3. Data model — full entity catalog

The Foundation slice ships **all** of these tables, even ones whose features arrive in later slices. Later slices fill tables in; they do not reshape them.

### 3.1 Conventions on every table

- `id` — **UUIDv7** primary key, generated in `lib/domain/ids.ts`.
- `organization_id` — on every app table, FK to `organizations`, indexed, used in every query. Postgres RLS policies keyed on a `SET LOCAL app.current_org_id` session variable act as the backstop.
- `created_at`, `updated_at` — timestamptz, always.
- `deleted_at` — nullable timestamptz soft delete on every table (offline-sync tombstones + DPA anonymize-not-drop).
- `version` — integer optimistic-lock column on user-editable entities (customers, products, draft invoices, estimates drafts, settings). Mismatched version on write ⇒ conflict error, never a silent overwrite.
- All money columns are `bigint` minor units named `*_minor`, always adjacent to a currency code column.

### 3.2 Identity & tenancy (Better Auth-owned)

Better Auth (with the organization plugin) owns these tables; we configure it to use our UUIDv7 generator and keep them otherwise stock. **App data never gets added to Better Auth tables** — it goes in our own tables keyed by `organization_id`, so auth-library upgrades stay painless.

| Table | Purpose / key columns |
|---|---|
| `users` | Account identity. Email, email_verified (gates invoice sending), name. |
| `sessions` | Active sessions; listable and revocable by the user; revoked on password change / role downgrade. |
| `accounts`, `verifications` | Better Auth credential + email-verification internals. |
| `organizations` | The tenant. Name, slug. Personal vs business is a `type` field in metadata. |
| `members` | user ↔ organization with `role` (`owner` \| `admin` \| `member` \| `viewer`). |
| `invitations` | Full lifecycle: email, role, status (`pending`/`accepted`/`expired`/`revoked`), expires_at. |

### 3.3 Organization configuration

| Table | Purpose / key columns |
|---|---|
| `organization_settings` | One row per org. `base_currency` (default `KES`), invoice/estimate/credit-note **number prefixes and next-number counters** (display numbers are assigned at issue by incrementing the counter under `SELECT … FOR UPDATE` — sequential per org, gap-minimal, entirely separate from PKs), default payment terms (net days), default tax rate. |
| `organization_branding` | Logo (R2 key), accent color, legal/business name, address, contact details, KRA PIN. Snapshotted onto invoices at issue. |
| `tax_rates` | Named rates per org. Rate stored as **integer basis points** (`1600` = 16.00% VAT) — no float percentages. |
| `tax_rate_versions` | Version history (Layer 3): full row image per change, changed_by, changed_at. |
| `fx_rates` | Manual (later: fetched) rates. `from_currency`, `to_currency`, rate as fixed-scale `numeric(18,8)` (a rate is a ratio, not money — conversion happens only inside `Money`), `effective_date`, `source` (`manual`/`api`). |

### 3.4 Customers & catalog

| Table | Purpose / key columns |
|---|---|
| `customers` | The company/individual being billed: name, customer type, billing + shipping addresses, notes, preferred currency. **No person-level contact info here** — that lives on `customer_contacts` (decision, 2026-07-05). Soft delete + `version`. |
| `customer_contacts` | Contact persons for a customer: salutation, first/last name, email, **work phone + mobile (MSISDNs — personal data: masked in logs, anonymized on deletion, never dropped from financial records)**, designation, department, `is_primary` (at most one live primary per customer, DB-enforced by partial unique index). Audited onto the customer's timeline. Soft delete + `version`. |
| `customer_versions` | Layer-3 history: full row image per change. Answers "what was this customer's address on date X". |
| `products` | Catalog items: name, description, unit label, `unit_price_minor` + `currency`, default `tax_rate_id`. `version`. |
| `product_versions` | Layer-3 history — price changes are the headline use case. |

### 3.5 Documents

| Table | Purpose / key columns |
|---|---|
| `invoices` | `customer_id`, `status` (`draft`/`sent`/`partial`/`paid`/`overdue`/`void`), `display_number` (null until issue), `currency` (transaction currency), `fx_rate_to_base` (`numeric`, null when currency = base; **frozen at issue**), `issue_date`, `due_date`, computed money columns (`subtotal_minor`, `discount_total_minor`, `tax_total_minor`, `total_minor`, `amount_paid_minor`), notes/terms, `public_token` (unguessable, for the hosted view), `issued_at`, `snapshot` JSONB. **Immutable after issue** — the service layer rejects edits to any non-draft invoice; corrections go through credit notes or new invoices. `version` applies to drafts only. |
| `invoice_line_items` | Per line: optional `product_id`, description, quantity (`numeric(12,3)`), `unit_price_minor`, discount (amount or bps), `tax_rate_bps` (copied, not referenced, so later tax edits can't reach into history), `line_total_minor`, position. Frozen with the invoice. |
| `estimates` + `estimate_line_items` | Same shape as invoices. Status: `draft`/`sent`/`accepted`/`declined`/`expired`/`converted`; `converted_invoice_id` links to the invoice created on conversion. Own numbering counter. |
| `credit_notes` + `credit_note_line_items` | Issued **against** an invoice (`invoice_id`), never by editing it. Own numbering, own snapshot, immutable once issued. Reduces the invoice's effective balance in reporting. |
| `recurring_invoices` + `recurring_invoice_items` | Template (customer, currency, line items) plus schedule: frequency, interval, `next_run_at`, end condition, status (`active`/`paused`/`ended`). Cron generates a **draft or auto-issued invoice** per run (org-configurable), audited as actor `system`. |

**The issue snapshot (Layer 2).** At issue time the service copies into `invoices.snapshot`: customer name/address/contact, org branding and legal details, each line's description/price/tax, and the FX rate to base. The hosted view, the PDF, and all historical reporting render **from the snapshot**, never from live rows. This is the mechanism that makes issued documents genuinely immutable.

### 3.6 Payments

| Table | Purpose / key columns |
|---|---|
| `payments` | Receipt against an invoice: `invoice_id`, `amount_minor` + `currency` **as received** (may differ from the invoice currency — a USD invoice paid in KES records both the KES amount and the conversion: `fx_rate_used`, `amount_in_invoice_currency_minor`, and any over/under-payment delta), `method` (`mpesa`/`bank`/`cash`/`card`/`other`), `source` (`manual`/`gateway`), `provider`, **`provider_transaction_id` (unique — the idempotency key for M-Pesa's late/duplicate/out-of-order callbacks)**, `paid_at`, `recorded_by`, notes. Recording a payment recomputes the invoice's `amount_paid_minor` and status (`partial`/`paid`) in the same transaction. |
| `payment_events` | Raw provider payloads: provider, event type, unique provider event id, full payload JSONB, processing status, matched `payment_id`. Empty until slice 8, but present from day one for reconciliation and audit. |

### 3.7 Audit & communications

| Table | Purpose / key columns |
|---|---|
| `audit_log` | **Append-only Layer 1.** `organization_id`, `actor_id` + `actor_type` (`user`/`system`/`api_key`), `action` as a business event (`invoice.issued`, `payment.recorded`, `member.role_changed`, …), `entity_type` + `entity_id`, `changes` JSONB (before/after diff), `metadata` JSONB (IP, user agent, request id), optional `reason`, timestamp. Written **inside every mutation's transaction** by `writeAudit`. A migration **REVOKEs UPDATE and DELETE** on this table from the application role — append-only is enforced by Postgres, not by convention. Activity timelines (per invoice, per customer, per org) are read straight from this table. |
| `email_messages` | Every outbound email (invoice send, reminder, invitation): recipient, type, related entity, Resend message id, delivery status. Deliverability is business-critical; this is its paper trail. |
| `comments` | Internal notes pinned to an entity (`entity_type`/`entity_id` — customers first, documents later). Org members only, never customer-visible; audited add/delete; authors always delete their own, `comment.delete` (admin+) for others. Added in the slice-1 customer-detail extension. |

### 3.8 Billing (self-monetization)

| Table | Purpose / key columns |
|---|---|
| `subscriptions` | One row per org: `plan` (`free`/`pro`), status, current period, provider customer/subscription refs (Paystack, slice 8+). Plan **entitlement definitions live in code** (`lib/authz/entitlements.ts`) — caps on invoices/customers, seats, recurring, multi-currency, watermark — and are checked server-side in the mutation pipeline exactly like permissions. Never gated: audit trail, export, getting paid. |

---

## 4. Money & currency

- **`Money` value object** (`lib/domain/money.ts`): wraps `{ amountMinor: bigint, currency: string }`. All arithmetic (add, multiply by quantity, apply discount, apply tax bps, allocate/round) lives here. Constructing from floats is impossible by API design; parsing user input goes string → minor units.
- **Different currencies never mix.** `Money.add` throws on currency mismatch. Aggregation across currencies happens only via explicit conversion using a stored rate, with rounding rules defined inside `Money` (banker's-free, round-half-up at the final step, documented in the module).
- **Base vs transaction currency.** Each org has a base currency (`organization_settings.base_currency`, default KES). Invoices may be issued in a foreign currency; the FX rate to base is snapshotted on the invoice at issue. Dashboards convert each document using **its own snapshotted rate** — reports never shift when today's rate moves.
- **Cross-currency payments** record the received currency, received amount, the conversion used, and the resulting delta against the invoice balance (small over/under-payment from rate movement is stored explicitly, not fudged).

---

## 5. Permissions & entitlements

Two orthogonal server-side gates, both enforced in the mutation pipeline, both org-scoped:

1. **Roles** — a static permission matrix in `lib/authz/permissions.ts` mapping `owner`/`admin`/`member`/`viewer` to actions (`invoice.issue`, `member.invite`, `settings.update`, …). Viewer is read-only. Only owner/admin manage members, settings, and voids.
2. **Entitlements** — plan-gated capabilities (Free caps, Pro features) checked the same way. UI hiding is cosmetic; the server check is the gate.

Client-side role/plan checks exist only to shape the UI and are never trusted.

---

## 6. Payment provider abstraction

```ts
// lib/payments/provider.ts — the only surface the domain sees
interface PaymentProvider {
  initiateCharge(...): Promise<ChargeSession>;     // STK push / checkout
  verifyWebhook(req): Promise<ProviderEvent>;       // signature check + parse
  // events carry a unique provider transaction id → idempotent processing
}
```

- Launch = manual recording only; the interface exists from the Foundation so slice 8 (Paystack) is additive.
- Webhook handling: verify signature → persist raw payload to `payment_events` → **no-op if `provider_transaction_id` already processed** → match to invoice → record payment through the same service path as manual payments (same audit, same status recomputation).
- Reconciliation job (cron) sweeps unmatched events and timed-out STK-push attempts.
- Daraja and Flutterwave later implement the same interface; no provider code in domain or UI, ever.

---

## 7. Cross-cutting concerns

- **Validation:** every mutation input has a Zod schema in `lib/validation`, shared with react-hook-form on the client but always re-parsed on the server.
- **Errors & observability:** Sentry on server and client. A scrubbing hook masks MSISDNs (and email local parts) in all events and breadcrumbs before send. Structured logs carry the request id that also lands in `audit_log.metadata`.
- **Rate limiting:** login, password reset, and invoice-send endpoints.
- **PDF & files:** invoices render with `@react-pdf/renderer` from the snapshot; generated PDFs and logos live in R2, served via signed URLs.
- **Email:** Resend on a dedicated sending subdomain with SPF/DKIM/DMARC configured before the first real invoice email (slice 3). Unverified users cannot send.
- **Cron (Vercel Cron):** daily overdue marking, recurring-invoice generation, payment reminders — all actor `system`, all audited. Migrates to Inngest/Trigger.dev when live payments need durable workflows.
- **Data-subject deletion:** anonymize PII in place (customer/user fields overwritten, MSISDN cleared) while invoices, payments, and audit rows are retained for their legal period. Soft delete everywhere makes this reversible-by-design until the retention job hardens it.
- **Offline enablers only** (no local-first now): UUIDv7 PKs, `updated_at` + soft-delete tombstones, pure service layer, no Vercel primitives in domain code.

---

## 8. Delivery plan

Each slice is production quality, deployed, and meets the Definition of Done (brief §9) before the next begins. **Slice 0 ships the entire schema above**, so slices 1–8 fill tables in rather than reshape them.

**Branching:** every slice is developed on its own branch named after it — `slice-0-foundation`, `slice-1-customers-products`, `slice-2-invoices`, and so on per the table below. Work never lands directly on `staging` or `main`. Flow: slice branch → `staging` (the staging environment, where a slice lands only when it meets the Definition of Done including its tests, §9) → `main` (production). `main` is always a deployable, rollback-safe history of completed slices; `staging` is where integration is proven before promotion. Fixes to an already-merged slice use short-lived `fix/<description>` branches into `staging`.

**Verification gate:** once a slice's implementation is complete and its tests are green, the `slice-verifier` subagent (`.claude/agents/slice-verifier.md`) reviews the slice branch — invariants (brief §5.2), security, code quality, and an independent re-run of the tests — and issues a PASS / PASS WITH CONCERNS / FAIL verdict. A slice merges only on PASS (or PASS WITH CONCERNS with the concerns explicitly accepted); FAIL means fix the blockers and re-verify. The gate is machine-enforced for AI sessions: a Claude Code `PreToolUse` hook (`.claude/hooks/slice-merge-gate.sh`) denies merging any `slice-*` branch into `staging` or `main` unless a PASS verdict is recorded at `.claude/verifier-pass/<branch>`; `staging` → `main` promotion passes through, since verification happened when the slice landed on `staging`. Mirror this server-side with GitHub branch protection on `staging` and `main` plus the required CI check.

| # | Slice | Contents | Exit criteria (beyond brief §9) |
|---|---|---|---|
| 0 | **Foundation** | Repo, CI, Vercel + Neon environments; full Drizzle schema + migrations incl. RLS policies and `audit_log` REVOKEs; Better Auth (signup, verify, login, reset, sessions) + organizations, members, invitations, roles; `Money`, `writeAudit`, `ActorContext`, permission/entitlement scaffolding; Sentry with MSISDN scrubbing. **Status: done — merged to `staging`, deployed.** | Empty-but-real app deployed; a user can sign up, verify, create an org, invite a member; cross-tenant isolation test passes; audit rows written for every auth/org mutation. |
| 1 | **Customers & products** | Full CRUD, version history tables populated, per-customer activity timeline, optimistic locking in anger. Extended with the Zoho-style customer workspace (master-detail, tabs: overview/comments/transactions/mails/statement) and first-class contact persons (customers are companies; people live on `customer_contacts`). **Status: implemented + verifier PASS (`slice-1-customers-products`, `slice-1-customer-detail`, `slice-1-contact-persons`); PRs to `staging` open.** | Version history answers point-in-time queries; timelines render from `audit_log`. |
| 2 | **Invoices** | Draft builder (line items, quantity, discount, tax), totals via `Money`, issue flow (display number under `FOR UPDATE`, snapshot, lock), statuses, void, multi-currency issuance with manual FX entry. Extended with tax-rate management + invoice numbering settings, the free-plan monthly issue cap, and the Pro multi-currency gate. **Status: implemented on `slice-2-invoices`; verifier pending.** | Issued invoice provably uneditable; totals unit-tested incl. FX; sequential numbers race-safe. |
| 3 | **PDF & send** | `@react-pdf/renderer` template from snapshot, Resend send with deliverability DNS, hosted public view via `public_token`, `email_messages` log. Extended with recipient selection from contact persons (never free-text addresses), the sender email-verification gate, an org-wide hourly send cap, the free-plan document footer, and a per-invoice Emails tab. **Status: implemented on `slice-3-pdf-send`; verifier pending.** | PDF/public view byte-stable against later customer/branding edits. |
| 4 | **Payments & branding** | Manual full/partial payment recording, cross-currency settlement, status recomputation, branding management + application, cron overdue marking. Extended with the R2 storage adapter (FileStorage port), logo application to PDF/hosted view at render time from the snapshot key, append-only payments, an org-wide Payments received page, and settlement deltas recorded explicitly. **Status: implemented on `slice-4-payments-branding`; verifier pending.** | Partial → `partial`, full → `paid`, cron flips `overdue`, all audited (system actor for cron). |
| 5 | **Dashboard & reporting** | Outstanding / paid-this-period / overdue, cash-flow view, per-customer and per-status breakdowns — all in base currency via snapshotted rates. Extended with receivables aging (current/1-30/31-60/61-90/90+) and CSS-only chart components on a CVD-validated palette. **Status: implemented on `slice-5-reporting`; verifier pending.** | No cross-currency sums without conversion; report totals reconcile with invoice-level data. |
| 6 | **Estimates & credit notes** | Estimate lifecycle + convert-to-invoice; credit notes against invoices with their own issue/snapshot/immutability. Extended with the cumulative credit cap, effective balance across all reporting, independent EST/CN counters in settings, document PDFs, and the shared line-items editor. **Status: implemented on `slice-6-estimates-credit-notes`; verifier pending.** | Conversion links documents; credited invoices report correct effective balance. |
| 7 | **Recurring invoices** | Schedules (frequency + interval + start/end), cron generation, pause/resume/end status machine, per-run auto-issue or draft. Pro-gated. **Status: implemented on `slice-7-recurring`; verifier pending.** | Generated invoices identical to hand-made ones; entitlement enforced server-side. |
| 8 | **Live payments** | Paystack behind `PaymentProvider`: STK push / checkout on hosted view, idempotent webhooks, raw payload persistence, reconciliation; self-billing for Pro subscriptions. **Status: implemented on `slice-8-live-payments`; verifier pending.** | Duplicate/out-of-order callbacks provably no-op; every event traceable payload → payment → invoice → audit. |
| 9 | **Ask Canja** (AI Q&A) | Natural-language questions over the org's own invoices/customers/payments. Two-lane router design: Lane 1 (shipped) classifies into a fixed intent catalog via a cheap LLM (strict JSON + server Zod re-parse), runs predefined org-scoped queries, and a second cheap call rephrases pre-formatted `Money` strings — the LLM never writes SQL, picks ids, or does arithmetic; citations are server-built from query rows. Pro-gated (`askCanja`, 500 questions/mo) + per-user/org rate limits; every answer row logs lane/model/tokens/latency. Lane 2 (pgvector semantic fallback; schema shipped in 0019) and response caching are follow-up phases per the approved plan. **Status: phase 1 implemented on `slice-9-ask-canja`; verifier pending.** | Free org provably rejected server-side; tenant isolation on all ai_* tables; injection fixture proves record text stays fenced data; router misparse degrades to an honest clarification, never a guess. |

---

## 9. Testing strategy

This is a financial tool, so tests are part of every slice's deliverable, not a follow-up. The style is **simple but verifiable**: each test asserts one observable behavior, is named after the invariant it protects, and avoids mocks wherever a real implementation is cheap. No slice merges without its tests, and CI blocks deployment on a red suite.

### 9.1 Three layers of tests

**1. Domain unit tests** (Vitest, pure, no I/O — `lib/domain`, pure helpers in `lib/services`):
- `Money`: construction, minor-unit parsing from strings, add/multiply/discount/tax-bps, rounding rules, and the *negative* cases — mixing currencies throws, float construction is uncompilable/rejected.
- Invoice math: line totals, subtotal/discount/tax/total composition, FX conversion with a snapshotted rate.
- Status machines: every legal transition for invoices, estimates, credit notes, invitations — and every illegal one rejected (e.g. editing `sent`, paying `void`, re-issuing `paid`).
- These run in milliseconds and are exhaustive; this is where "money is always exact" is proven.

**2. Service integration tests** (Vitest against a real Postgres — local Docker/PGlite in dev, a Neon branch in CI — because the invariants under test live in the database):
- **Tenant isolation:** for every entity, org A cannot read or mutate org B's rows, through both the service API and raw RLS. This suite grows with every new table; it is the brief §9 requirement made executable.
- **Audit atomicity:** a mutation that rolls back leaves *neither* the change nor the audit row; a mutation that commits always leaves exactly one audit row with the right actor.
- **Append-only enforcement:** UPDATE/DELETE on `audit_log` as the application role fails at the database level.
- **Immutability:** any write to an issued invoice through any service path is rejected; snapshot content is byte-stable after mutating the customer, product, branding, and tax rate it was built from.
- **Concurrency:** optimistic-lock conflicts surface as errors, not silent overwrites; parallel issuance produces gap-free, duplicate-free display numbers (`FOR UPDATE` race test).
- **Idempotency (slice 8):** replaying the same provider event id is a no-op.

**3. Transport smoke tests** (thin, few): Server Actions/route handlers reject unauthenticated and under-privileged callers and pass validation errors through cleanly. No business logic lives here, so coverage stays deliberately light — testing effort concentrates where the money logic is.

### 9.2 Conventions

- **Test fixtures build through services**, not raw inserts, so every fixture also exercises the mutation pipeline (a raw-insert fixture can silently bypass a broken audit write).
- **Two-org fixture by default:** most integration tests create two organizations so isolation assertions are ambient, not an afterthought.
- **Every bug fix lands with a regression test** reproducing it first.
- **Per-slice gate:** the slice table in §8 is only "done" when its listed exit criteria exist *as passing tests*, not as manual checks.

---

## 10. Decisions log

| Decision | Status |
|---|---|
| Stack (brief §5.1): Next.js 15 / Neon / Drizzle / Better Auth / Resend / R2 / react-pdf / Paystack-first | **Locked** |
| Money = bigint minor units in `Money` VO; tax rates as integer bps; FX rates as `numeric(18,8)` | **Locked** |
| Better Auth tables stay stock; app data in own tables; UUIDv7 everywhere via config | **Locked** (verified in slice 0: `advanced.database.generateId`) |
| Better Auth scope: **authentication only** (users, sessions, verification, reset). Organizations/members/invitations are managed by `lib/services/organizations` — the org plugin's own endpoints would mutate tenancy outside the audit-in-same-transaction pipeline. Tables keep the plugin-compatible shape. | **Locked** (slice 0) |
| IDs stored as `text` columns (UUIDv7 strings) rather than `uuid` type, for consistency with Better Auth's text ids across all FKs | **Locked** (slice 0) |
| Display numbers via per-org counters in `organization_settings` under `FOR UPDATE` | **Locked** |
| Snapshot as JSONB on the document row (vs separate snapshot tables) | Chosen for simplicity; revisit only if snapshot querying becomes a need |
| Product name | **Resolved** (2026-07-14): **Canja** (Lojban for "barter trade") |
| Free-tier caps & Pro price | Open — validate before launch; entitlement code makes limits config-level changes |
| Kenyan-entity payout prerequisites (KRA PIN, registration, bank) | Open — confirm before slice 8 |
| Recurring: auto-issue vs draft-per-run default | **Resolved** (slice 7): per-schedule choice (`auto_issue` = `draft` \| `issue`), default `draft`. Auto-issue runs only in the org's **base currency** — a foreign-currency run always lands as a draft because it needs a human-set FX rate before issuing. A run advances `next_run_at` regardless of outcome (even an empty/misconfigured schedule) so a broken run never loops; a **downgraded** org's schedules are skipped and left untouched (not advanced), resuming automatically if the org re-upgrades. Generation is one system-actor transaction per schedule; auto-issue happens best-effort after commit via the shared `issueInvoice`. Editing a schedule may not move `next_run_at` to or before the latest date it has already invoiced — a double-billing guard enforced server-side in `updateRecurring` and surfaced in the edit form (min-date + warning). |
| Branch flow: slice → `staging` (staging env) → `main` (production); verifier gate applies to slice merges into either protected branch | **Locked** (user decision, 2026-07-03) |
| Customers are companies/individuals; ALL person-level contact info lives on `customer_contacts` (multiple per customer, one primary). `customers.email/phone` dropped, backfilled into primary contacts by migration 0007. Invoice sending (slice 3) addresses contact persons. | **Locked** (user decision, 2026-07-05) |
| **Images behind the R2 storage adapter:** contact-person profile photos shipped post-slice-4 (`customer_contacts.photo_key`, migration 0014; superseded photo objects ARE deleted — PII referenced only by the live row, the deliberate opposite of snapshot-referenced logos). Product images remain planned — additive `products.image_key` + upload UI on the same pattern. | **Both done** (2026-07-08): photos migration 0014, product images migration 0015 (`products.image_key`, live-row-only → superseded objects deleted, version-history rows on every change) |
| Products carry a `product_type` (goods \| service, default service for the freelancer-first market); unit labels are free vocabulary per org, offered via a type-to-add combobox. | **Locked** (user decision, 2026-07-06) |
| Component library: **shadcn/ui** (radix-lyra style, neutral base, lucide icons, user-selected theme in `globals.css`). All UI builds on `src/components/ui` primitives; no bespoke one-off styling for things a primitive covers. | **Locked** (user decision, 2026-07-03) |
| App shell: full-height sidebar (shadcn `sidebar` primitive) with wordmark, org switcher at top, and workspace nav; content header carries the user menu. Org-scoped routes render inside `orgs/[orgId]/layout.tsx`; org-less pages use a plain top bar; `/dashboard` redirects into the org. New sections join the sidebar as slices land. | **Locked** (user decision, 2026-07-03) |
| **Invoice lifecycle semantics (slice 2):** `sent` is the issued/receivable state — issue moves `draft → sent`, assigns the number, freezes totals, and takes the snapshot; the slice-3 email send does not change status. Drafts are deleted, never voided; void covers `sent/partial/overdue`, requires a reason (stored on the audit row), and leaves the document exactly as issued. `paid` is terminal — corrections go through credit notes (slice 6). | **Locked** (slice 2) |
| **Invoice math (slice 2):** per-line rounding, once per component (gross, discount, tax), half away from zero; tax applies to the discounted base; document totals are exact sums of the rounded lines, so the invoice always equals what its lines display. Rates/discounts are basis points end-to-end (UI shows percent). The invoice builder imports the same `lib/domain/invoice-math` module for its live preview. | **Locked** (slice 2) |
| **Entitlement checkpoints (slice 2):** the free-plan monthly invoice cap counts documents *issued* that calendar month, enforced inside the issue transaction; `multiCurrency` is checked at draft create/update AND at issue (defense in depth), with the UI narrowing the currency select to match. Numbering counters only move forward — a lowered next-number could collide with issued display numbers. | **Locked** (slice 2) |
| **Concurrent-issuance race test deferred to CI (slice 2, verifier M1):** the §9.1 "parallel issuance produces gap-free, duplicate-free numbers" test cannot run in the PGlite harness (single-connection — two competing transactions are inexpressible). The property holds by construction (`SELECT … FOR UPDATE` on the org counter, partial unique index as backstop, both reviewed by the verifier); the explicit race test lands with the Neon-branch CI path §9.1 already names. | Open — CI infrastructure |
| **PDF templates (post-slice-4, user decision 2026-07-07):** a built-in catalog (`classic` free; `compact`/`bold` Pro via the existing `customTemplates` entitlement, checked server-side at selection AND at issue). The chosen template is frozen into the issue snapshot — switching templates or downgrading never re-skins issued documents; a downgraded org's new documents fall back to classic. Stored on `organization_branding.pdf_template` (migration 0013). | **Locked** |
| **Estimate lifecycle completed (2026-07-09):** the slice-6 deferrals are resolved — estimate email-send (`sendEstimate` + `estimate-send` template, PDF attached), the hosted public quote at `/e/[token]` (view/accept/decline), and a `viewed` status. Public client actions run under a new `customer` actor type (the token is the capability); a view is recorded by a browser-mount effect (not link-scanner prefetch) and only advances a freshly-sent quote. Accept is refused past the valid-until date. Conversion still produces an invoice DRAFT; credit-note lines still carry no percentage discount. | **Locked** |
| **Org activity timeline relocated (2026-07-08):** the dashboard became the financial overview (user redesign), so the org-wide audit trail (brief §5.3) lives at `orgs/[orgId]/activity` with a Workspace nav entry. Per-entity timelines unchanged. Also accepted: issued estimate/credit-note WORKSPACES render live rows (money columns are DB-frozen; the PDF and public paths render from snapshots) — the invoice workspace's snapshot-first pattern is the eventual target. | **Locked** |
| **Live payments (slice 8, 2026-07-13):** collection sits behind `lib/payments` `PaymentProvider` (Paystack first: `initiateCharge` + HMAC-SHA512 `verifyWebhook`, provider quirks contained in the adapter). A new **`payment_intents`** table (additive migration 0018, its own `org_isolation` RLS policy) holds the correlation between our unguessable `reference` and what is paid — invoice or subscription. Webhook path: verify signature → persist raw payload to `payment_events` → **no-op if already processed** (unique `(provider, provider_event_id)`) → match the intent → settle through the SAME `applyInvoicePayment` path as manual recording (system actor, `source = gateway`, unique `provider_transaction_id` as a second idempotency net) → audit. Charges are collected in the invoice's own currency (no cross-currency conversion on collection). Unmatched references return 200 with nothing persisted (no org to attribute to). A reconcile cron (`/api/cron/reconcile-payments`, daily) sweeps pending intents past a 30-min TTL to `abandoned` and downgrades lapsed Pro subscriptions. | **Locked** (slice 8) |
| **Self-billing for Pro (slice 8, 2026-07-13):** the platform collects its own subscription revenue through the same rail. `initiateSubscriptionCharge` (owner-only, `billing.manage`) charges `proPrice(interval)` in KES; a successful webhook runs `activateProSubscription` in the same commit as the paid event (plan `pro`, period set by `billingPeriodEnd`, month arithmetic clamped to the last valid day), so an org is never Pro without its paid event. Pricing is a **placeholder** in `lib/authz/plan-pricing.ts` (KES 1,500/mo, KES 15,000/yr) pending validation — a config edit, like the entitlement caps. A true recurring Paystack Plan is a follow-up; today a lapsed period is downgraded to free by the reconcile cron. | **Placeholder pricing; mechanism locked** (slice 8) |
| **Ask Canja (slice 9, 2026-07-17):** OpenAI-only provider behind `lib/ai` `AiPort` (chat `gpt-5.4-nano`, embeddings `text-embedding-3-small`; env-overridable — pricing drift is config). Chat is READ-ONLY and writes **no audit_log rows** — the interaction/cost log IS `ai_chat_messages` (lane, model, tokens, latency); high-volume Q&A in the financial trail would pollute timelines. Money reaches the model only as pre-formatted `Money.toString()` strings with a verbatim-reproduction prompt; entity/date resolution is deterministic code (Nairobi UTC+3 hardcoded — timezone setting is a future field). Lane 2 corpus table (`ai_embeddings`, pgvector on Neon; `@electric-sql/pglite-pgvector` in the test harness) ships empty in 0019 per fill-don't-reshape. Pro-only per user decision 2026-07-16. | **Locked** (slice 9 phase 1) |
| **Verify-on-callback fallback (slice 8, 2026-07-14):** settlement no longer depends on the webhook alone. Both `initiate*` charges set `callback_url` to `/api/payments/return`; that handler calls `PaymentProvider.fetchTransaction(reference)` (Paystack `GET /transaction/verify/:reference`, outbound — works from localhost), settles through the SAME idempotent `processEvent` core as the webhook, then redirects to the billing page or hosted invoice with state already updated. Whichever of webhook/callback arrives first wins; the other no-ops (both key on the intent locked `FOR UPDATE`, and `fetchTransaction` labels a paid charge `charge.success:<txn>` so its `payment_events` id matches the webhook's for a clean unique-index dedup). Authenticity comes from asking the provider with our secret, not a signature. This also makes local testing work without a public webhook URL. | **Locked** (slice 8) |
