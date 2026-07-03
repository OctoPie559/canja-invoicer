# `<PRODUCT_NAME>` — Problem Definition & Project Brief

> **Working title:** `<PRODUCT_NAME>` (placeholder, replace throughout with your chosen name).
> **Document type:** Source-of-truth brief for AI-assisted development.
> **Status:** Living document. Update it as decisions change, and point your AI model (Claude Code / Cursor) at it as primary context on every session.

---

## 0. How to use this document

This is the single source of truth for the project. It exists to be read by an AI coding assistant and by any human collaborator before writing code.

Rules for anyone (human or AI) building on this project:

1. The conventions and invariants in **Section 5.2** are non-negotiable. Never violate them, even when a shortcut looks harmless. If a request appears to require breaking one, stop and flag it instead of proceeding.
2. This is **not an MVP build**. Do not scaffold throwaway code or "we'll fix it later" placeholders. Every slice shipped is production quality.
3. When something here is ambiguous or missing, ask before assuming. Do not invent product behavior that isn't specified.
4. Prefer the patterns already established in the codebase over introducing new ones. Consistency beats cleverness.

---

## 1. Problem Definition

### 1.1 Problem statement

Freelancers and small businesses in Kenya lack a single tool that lets them invoice professionally, collect payment through the methods their clients actually use (primarily M-Pesa), and keep a trustworthy financial record of everything, whether they work alone or with a small team.

Today this work is done with a patchwork of Word or Excel templates, exported PDFs, and manual follow-up over WhatsApp and SMS. Payments arrive by M-Pesa with no automatic link back to the invoice. There is no reliable record of who changed what, no clear view of who owes money and when, and no defensible trail when a dispute arises. The result is lost time, delayed payments, weak cash-flow visibility, and avoidable disputes.

### 1.2 Who has this problem

- **Solo freelancers** (designers, developers, consultants, writers, photographers, trainers) who bill clients directly and need to look professional and get paid without accounting-software overhead.
- **Small businesses and agencies** with a handful of staff who need the same, plus the ability to have team members create and manage invoices while the owner retains a clear record of who did what.

Both segments share the same core need. The team case adds accountability requirements but does not change the fundamental jobs.

### 1.3 Why existing solutions fall short for this market

- **Global tools (Zoho Invoice, QuickBooks, FreshBooks, Wave)** are not built around M-Pesa, which is the dominant way Kenyans pay. Their payment collection assumes cards and processors like Stripe, which does not natively support Kenyan merchants. This forces awkward workarounds and pushes payers toward methods they rarely use.
- **Pricing and localization** on global tools is USD-first and does not fit local expectations or currency.
- **Manual methods (Word, Excel, PDF)** produce no audit trail, no payment reconciliation, and no cash-flow view. Records are easy to lose or quietly alter, which is exactly the opposite of what a financial tool should offer.
- **M-Pesa alone** moves the money but keeps no structured record tied to invoices, customers, or history.

The gap is a tool that combines proper, branded invoicing, M-Pesa-native collection, a rigorous audit trail, and support for both solo and small-team use, localized for Kenya and priced for it, with a clean path to expand across Africa and globally later.

### 1.4 Jobs to be done

- When I finish work for a client, help me bill them with a professional, branded invoice and get paid quickly through the methods they use.
- Help me see who owes me what, and when it is due or overdue, at a glance.
- Give me a complete, trustworthy record of every financial change, whether I work alone or with a team, so I can always get answers when I need them.
- Let me manage my customers, products, and branding in one place without the complexity of full accounting software.
- Let team members do the work while I keep clear visibility and accountability over what they changed.

### 1.5 What success looks like

Product outcomes:

- Time from finishing work to sending an invoice drops to minutes.
- Payment cycle time shortens because paying is frictionless for the client.
- The user can answer "who owes me what" and "what changed and who changed it" instantly and accurately.
- Zero disputes caused by lost or altered records.

Quality outcomes (see Section 9 for the enforceable bar):

- Money is always exact. Financial documents are immutable once issued. Tenant data is never leaked across organizations. Every mutation is audited.

---

## 2. Product Vision & Principles

### 2.1 Vision

A sophisticated, locally-native invoicing and payment management platform for Kenyan freelancers and businesses, built fully and built to last, that grows through refinement rather than rework.

### 2.2 Guiding principles

- **Architectural completeness, not big-bang delivery.** The complete domain model, audit system, permission model, and payment abstraction are designed up front so nothing built later forces a teardown of foundations. Features are then delivered as finished, deployed vertical slices on top of that foundation.
- **Not an MVP.** Iterations improve the software; they do not restructure it. Corners are not cut. Placeholder or throwaway code is not acceptable.
- **Correctness first.** This is a financial tool. Exactness, immutability of issued documents, and auditability outrank speed of delivery.
- **Local-native.** Kenya-first in payments, currency, and data handling, architected so global expansion is additive rather than a rewrite.
- **Portable by design.** Web now, offline desktop later. A small set of schema and architecture decisions made now (Section 5.5) keep that path cheap.

---

## 3. Target Users & Context

- **Primary market:** Kenya. Mobile-money-first (M-Pesa), price-sensitive, mixed connectivity.
- **Primary personas:** solo freelancer; small business or agency owner with a few team members.
- **Expansion path:** pan-African then global. Design decisions must not block this, but do not build for it yet.
- **Environment realities:** M-Pesa is the default payment rail. Phone numbers are the primary customer identifier and are legally personal data. Offline capability is a future requirement, not a current one.

---

## 4. Scope

This is a full build. The feature set below is the complete intended product. It is delivered in slices (Section 4.3), but the domain model in the initial schema must account for **all** of it, including features implemented later, so that adding them fills in tables rather than reshaping existing ones.

### 4.1 In scope (complete feature set, by module)

- **Identity & organizations:** signup, email verification, login, password reset, session management, multi-tenant organizations, personal vs business accounts.
- **Team & permissions:** member invitations (full lifecycle), roles (owner, admin, member, viewer), server-enforced permissions scoped by organization.
- **Customers:** full CRUD, contact and billing details, per-customer history and activity.
- **Products & services:** reusable catalog items with default price and tax rate, version history on price changes.
- **Invoices:** draft creation, line items with quantity, unit price, discount, and tax, subtotal and total math, per-organization sequential display numbers, issuance in the organization's base currency or a foreign transaction currency (with the FX rate snapshotted at issue, Section 5.6), statuses (draft, sent, partial, paid, overdue, void), issue (which locks the document), send by email, hosted public invoice view, PDF generation.
- **Estimates / quotes:** create, send, and convert to invoice.
- **Credit notes:** issued against invoices for corrections and refunds (never by editing an issued invoice).
- **Recurring invoices:** schedule-based automatic invoice generation.
- **Payments:** manual payment recording (full and partial) at launch; live collection via gateway added later behind a provider interface (Section 5.4).
- **Branding:** logo, accent color, business details applied to invoices and the public view.
- **Dashboard & reporting:** outstanding, paid-this-period, overdue counts, cash-flow view, per-customer and per-status breakdowns.
- **Settings:** tax rates, currency, invoice numbering, organization profile.
- **Audit & history:** append-only audit log, per-entity version history, invoice snapshots (Section 5.3), and user-facing activity timelines.

### 4.2 Out of scope / explicitly deferred

- **Offline desktop application.** Future phase. Only the enabling schema/architecture decisions are made now (Section 5.5).
- **Full accounting** (general ledger, balance sheets, P&L), inventory management, payroll, expense tracking. Not this product.
- **Live payment gateway integration** is deferred to a post-launch slice. Launch uses manual payment recording.
- **Live automatic FX rate feeds and exotic cross-currency reconciliation** are later refinements. Multi-currency invoicing itself is in scope and designed in early (Section 5.6); only live rate feeds and edge-case reconciliation are deferred.

### 4.3 Delivery approach

Production-quality vertical slices on a complete foundation, in this order. Each slice is finished and deployed before the next begins.

0. **Foundation:** full schema (all entities), auth, organizations, tenancy, audit infrastructure, money conventions (including organization base currency and per-record currency fields) and ID conventions, deployment pipeline. Deploy an empty but real app.
1. **Customers & products** (fully done).
2. **Invoices**: build, issue, snapshot, statuses, numbering, and multi-currency issuance (base or foreign transaction currency with FX snapshot; manual rate entry at first).
3. **PDF & email send**, hosted public invoice view.
4. **Manual payments & branding**, overdue detection.
5. **Dashboard & reporting.**
6. **Estimates and credit notes.**
7. **Recurring invoices.**
8. **Live payment collection** (Paystack first, behind the provider interface).

### 4.4 Monetization model

Free + Pro freemium, collected locally. The competitive anchor is Zoho Invoice, which is free with generous limits, so the core invoicing loop must stay free; the wall goes around scale, automation, and polish, never around trust.

- **Free tier:** core invoicing fully functional, one user, a capped volume (for example a monthly cap on invoices or customers), one branding set, manual payment recording, and the full audit trail.
- **Pro tier:** watermark removal, team members and additional seats, recurring invoices and automated reminders, multi-currency and international invoicing, custom templates and full branding control, advanced reports and cash-flow analytics, and a branded client portal or custom domain.
- **Never gated:** the audit trail (it is the core trust differentiator), data export (PDF/CSV), and the ability to get paid. Withholding any of these damages trust in a financial tool.
- **Billing model:** subscription, monthly with a discounted annual option. A transaction fee on collected payments is deliberately not pursued now, since it would place the platform in the money flow and add regulatory burden.
- **Self-billing:** the platform collects its own subscription revenue through the same Kenya-native rail (Paystack / M-Pesa), which sidesteps the Stripe-payout-to-Kenya limitation.
- **Enforcement:** plan entitlements are checked server-side, the same way permissions are (Sections 5.2 and 6). A gated feature is never merely hidden in the UI.

---

## 5. Technical Architecture

### 5.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Type safety across financial logic |
| Framework | Next.js 15 (App Router), monolith | Velocity, with a pure service layer for future extraction |
| Hosting | Vercel | Fits Next.js; mitigate serverless gaps with a queue |
| Database | PostgreSQL on Neon | Financial-grade, Vercel-friendly, branching for migration testing |
| ORM | Drizzle | Type-safe, disciplined migrations |
| Auth & orgs | Better Auth + organization plugin | Multi-tenant, self-hosted, free |
| Validation | Zod + react-hook-form | Shared client/server schemas, server-authoritative |
| Email | Resend + SPF/DKIM/DMARC on a dedicated sending subdomain | Invoice deliverability is business-critical |
| File storage | Cloudflare R2 | Cheap, zero egress (logos, PDFs) |
| PDF | @react-pdf/renderer | Serverless-friendly, no headless Chrome |
| Payments | Provider interface; Paystack first, Daraja and Flutterwave later | M-Pesa + cards, best DX; cost optimization and expansion later |
| Background jobs | Vercel Cron now; Inngest or Trigger.dev when live payments land | Reminders and overdue now, durable payment workflows later |
| Errors & audit | Sentry + `audit_log` table | Debuggability plus dispute resolution |
| Tests | Vitest on the domain layer | Correctness where it counts |

> Database host (Neon) and auth (Better Auth) are decided. The table reflects the locked stack.

### 5.2 Non-negotiable conventions & invariants

These are absolute. Do not break them.

- **Money is stored as integer minor units** (`bigint`), never as floats or decimals-as-numbers, always alongside a currency code. All money passes through a `Money` value object. Never add or compare amounts of different currencies; aggregate across currencies only after converting to the organization's base currency using a stored FX rate (Section 5.6).
- **Primary keys are UUIDv7** (sortable), never auto-increment integers. Invoice *display numbers* are a separate, per-organization sequential column, distinct from the PK.
- **Every table carries `organization_id`.** Every query is scoped by it. Tenant isolation is enforced server-side, with Postgres row-level security as a backstop.
- **Permission checks are server-side, on every mutation, scoped by organization.** Client-side role checks are UX only and are never trusted.
- **All business logic lives in a pure `lib/services` layer** that has no knowledge of Next.js, Vercel, or the transport. Server Actions and route handlers are thin wrappers that call services. This keeps the offline port and any future backend extraction cheap.
- **Validation is server-authoritative.** Every mutation validates its input with Zod on the server, regardless of client validation.
- **Issued financial documents are immutable.** Once an invoice is issued it is write-once. Corrections happen via credit notes or new documents, never by editing the original (Section 5.3).
- **Every mutation writes its audit event in the same database transaction as the change.** If the change rolls back, the audit entry rolls back with it. No mutation is exempt.
- **The `audit_log` is append-only at the database level.** UPDATE and DELETE are revoked for the application role. A trail that can be rewritten is not a trail.
- **Mask phone numbers (MSISDNs) in logs and error reports.** They are personal data under Kenyan law (Section 7).

### 5.3 Audit trail architecture

Three complementary layers, all present from the initial schema.

**Layer 1 — Append-only event log.** A central `audit_log` table. Each row records: `organization_id`, `actor_id` and `actor_type` (user, system, or api_key), `action` as a business event (`invoice.issued`, `payment.recorded`, `member.role_changed`, `product.price_updated`), `entity_type` and `entity_id`, a `changes` JSONB (before/after diff), a `metadata` JSONB (IP, user agent, request/trace id), an optional `reason`, and a timestamp. Populated inside the mutation's transaction via the service layer, so intent is captured, not just column diffs. Optional Postgres triggers using a `SET LOCAL app.current_user_id` session variable can be added later as a safety net. Actor context (user, org, IP, request id) is threaded to the service layer via `AsyncLocalStorage` so attribution is automatic.

**Layer 2 — Immutable documents with snapshots.** When an invoice is issued, it stores a snapshot of everything it depends on: customer name and address, each line item's description and price, tax rates, branding, and (for foreign-currency invoices) the FX rate to the base currency. Historical invoices therefore never change when a customer address, product price, or exchange rate changes later. This is what keeps the audit trail honest.

**Layer 3 — Version history.** Customers, products, prices, and tax settings keep full version history (a history table per audited entity), so the system can answer "what was this value on a given date" precisely.

**Supporting requirements:** automated actors (cron marking overdue, payment callbacks) are audited as `system`. Every invoice and the organization expose a human-readable activity timeline in the UI. Audit rows contain personal data, so they follow the retention and masking rules in Section 7. Hash-chaining for tamper-evidence is available as a future upgrade but is not built now.

### 5.4 Payment architecture

- All payment logic sits behind a `PaymentProvider` interface. No provider-specific code leaks into the domain or UI.
- **Launch:** manual payment recording only (full and partial), which updates invoice status through the service and audit layers.
- **First live provider:** Paystack (M-Pesa + cards, strong DX, T+1 settlement, fast onboarding).
- **Later:** direct Safaricom Daraja (Daraja 3.0) as a cost optimization at higher volume; Flutterwave for pan-African expansion. Both plug into the same interface.
- **Webhook handling is idempotent.** Store a unique provider transaction id and no-op on duplicates, because M-Pesa callbacks arrive late, duplicated, and out of order.
- **Persist the raw provider payload** for every payment event for reconciliation and audit.
- **Reconciliation** matches each callback back to its invoice and handles timed-out or abandoned STK-push attempts.

### 5.5 Offline-readiness posture

Do **not** build local-first now. Only bake in these free enablers so the future desktop port is cheap:

- UUIDv7 primary keys (already required above).
- `updated_at` and soft-delete columns on every table (sync engines need tombstones).
- The pure, framework-agnostic service layer (already required above).
- No Vercel-only primitives leaking into domain logic.

Future path (not now): a Tauri shell wrapping local SQLite, synced to Postgres via PowerSync or ElectricSQL.

### 5.6 Multi-currency & FX

Multi-currency invoicing is a first-class, early feature, because many Kenyan freelancers bill international clients in USD, EUR, or GBP. The storage model already supports it; these rules complete it.

- **Base currency:** each organization has a base (reporting) currency, defaulting to KES. All dashboards and aggregate totals are expressed in it.
- **Transaction currency:** an invoice may be issued in a currency other than the base.
- **FX snapshot at issue:** the rate from transaction currency to base currency is captured on the invoice at issue time and stored on it, consistent with the Layer 2 immutability rule, so historical reports never shift when rates move.
- **Rate source:** manual entry to begin with, upgradable to a scheduled daily fetch from a rates API. Live per-transaction rates are not required.
- **Reporting conversion:** aggregate figures convert each invoice using its own snapshotted rate. Raw amounts in different currencies are never summed.
- **Cross-currency payment:** an invoice in one currency may be settled in another (for example a USD invoice paid via M-Pesa in KES). Record the payment's own currency, the amount received, and the conversion, and handle small over- or under-payment caused by rate movement.
- **Rounding:** conversion applies defined rounding rules and stays inside the `Money` value object.

---

## 6. User Management & Permissions

- **Verification gate:** a user must have a verified email before sending an invoice, to protect sending-domain reputation.
- **Organization model:** a user can belong to many organizations; an organization has many members. Solo and team cases share one model.
- **Roles:** owner, admin, member, viewer. Enforced server-side on every mutation, scoped by organization.
- **Invitations:** full lifecycle (pending, accepted, expired, revoked, re-invited).
- **Sessions:** revoke on password change or role downgrade; users can view and end active sessions.
- **Account lifecycle vs financial records:** deleting a user or organization must not drop invoices or payment history. Use soft-delete plus PII anonymization that preserves financial records, consistent with data-subject rights.
- **Concurrency:** editable records use an optimistic-lock version column so concurrent edits do not silently overwrite each other.
- **Rate limiting:** on login, password reset, and invoice sends.

---

## 7. Compliance & Data Protection (Kenya DPA 2019)

- Phone numbers (MSISDNs) and other customer contact data are personal data under the Data Protection Act 2019, overseen by the ODPC. Mishandling can incur fines.
- Mask MSISDNs in logs and error reports. Capture only the data needed. Record consent where required.
- Support data-subject rights (access, deletion) through the soft-delete-and-anonymize approach in Section 6, while retaining financial and tax records for their legally required period.

---

## 8. Domain Glossary

Use these terms consistently in code and UI.

- **Organization:** the tenant. Every record belongs to exactly one. A user's workspace.
- **Member:** a user's membership in an organization, carrying a role.
- **Customer:** a client the user invoices. Not a system user.
- **Product:** a reusable catalog line item (a good or service).
- **Invoice:** a billing document. `draft` before issue, immutable after.
- **Issue:** the act of finalizing an invoice, which locks it and takes the dependency snapshot.
- **Estimate:** a quote that can convert into an invoice.
- **Credit note:** a document issued against an invoice for a correction or refund.
- **Payment:** a recorded receipt against an invoice, full or partial, manual or gateway-sourced.
- **Actor:** whoever caused a change (a user, the system, or an API key). Every audit entry has one.
- **Snapshot:** the copied-at-issue-time state stored on an issued invoice.
- **Base currency:** the organization's reporting currency (default KES) that all aggregate totals are expressed in.
- **Transaction currency:** the currency a specific invoice is issued in, which may differ from the base currency.
- **FX rate snapshot:** the exchange rate to base currency, captured and frozen on an invoice at issue time.
- **Entitlement:** a plan-gated capability (Free vs Pro), checked server-side like a permission.

---

## 9. Quality Bar & Definition of Done

A slice is done only when all of the following hold:

- Tests ship with the code, in the same slice — simple but verifiable, covering the slice's behavior at the domain and service layers (testing strategy: ARCHITECTURE.md §9). This is a financial tool; untested money-touching code does not merge.
- Money logic (totals, tax, discounts, currency conversion, status transitions) has unit tests. No floats anywhere in money handling, and no cross-currency totals without conversion through a stored rate.
- An explicit test proves one organization cannot read or mutate another's data.
- Every mutation in the slice writes an audit entry in the same transaction, and it appears in the relevant activity timeline.
- All inputs are validated server-side with Zod.
- Issued documents cannot be edited; corrections go through the correct document type.
- Errors are captured in Sentry; MSISDNs are masked in all logs.
- The slice is deployed and works end to end against real data, not just locally.

---

## 10. Risks & Open Decisions

**Decided:** database host is Neon; auth is Better Auth; monetization is Free + Pro subscription (Section 4.4); multi-currency invoicing is in scope and designed in early (Section 5.6).

**Still open / to confirm:**

- **Product name** is TBD and does not block the Foundation slice.
- **Payment payout requirements for a Kenyan entity.** Stripe does not natively support Kenyan merchants, which is why collection is M-Pesa-native (Paystack, then Daraja/Flutterwave). Confirm settlement and payout prerequisites (KRA PIN, business registration, bank details) before the live-payments slice.
- **Free-tier limits and Pro price point** need validation against local willingness to pay before launch.

---

## 11. Assumptions

- The product is a passion project built to a professional standard, without a hard external deadline, so the full-build approach is appropriate.
- Team features are in scope from the design stage, even though solo use is the most common case.
- Kenya is the launch market; global expansion is a later, additive phase.
- The maintainer is the primary developer, working with AI assistance, and values plain language, defensible decisions, and consistency over cleverness.
