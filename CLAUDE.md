# invoicer — AI session context

Kenya-first invoicing & payments platform for freelancers and small teams. Working name `invoicer` (placeholder). Not an MVP: every slice shipped is production quality.

## Read before writing any code

1. **[PROJECT_BRIEF.md](./PROJECT_BRIEF.md)** — source of truth for the problem, scope, and requirements. Section 5.2 lists the non-negotiable invariants; section 9 is the Definition of Done.
2. **[ARCHITECTURE.md](./ARCHITECTURE.md)** — source of truth for structure: layering rules, the mutation pipeline, the full entity catalog, and the slice-by-slice delivery plan (§8) with current status.

## Hard rules (full list in brief §5.2 — these are the ones violated most easily)

- Money is `bigint` minor units through the `Money` value object — never floats, never cross-currency arithmetic without a stored rate.
- Every table has `organization_id`; every query is scoped by it; permission and entitlement checks are server-side on every mutation.
- Every mutation writes its `audit_log` row **in the same transaction**. The log is append-only at the database level.
- Issued documents are immutable; corrections go through credit notes or new documents.
- All business logic lives in the pure `lib/services` layer — no Next.js/Vercel imports there. Server Actions and route handlers are thin wrappers.
- Mask MSISDNs (phone numbers) in all logs and error reports.
- Tests ship with the code, in the same slice/PR — simple but verifiable (ARCHITECTURE.md §9): domain math and status machines as unit tests, tenant isolation / audit atomicity / immutability as integration tests against real Postgres. A slice without its tests is not done.
- If a request seems to require breaking any invariant, stop and flag it instead of proceeding. When the brief is ambiguous, ask — don't invent product behavior.

## Working conventions

- One branch per slice, named after it (`slice-0-foundation`, `slice-1-customers-products`, …). Never commit slice work directly to `staging` or `main`. Flow: slice branch → PR into `staging` (the staging environment) → PR from `staging` into `main` (production). A slice merges into `staging` only when it meets the Definition of Done. Post-merge fixes go on `fix/<description>` branches into `staging`.
- **After implementing a slice and getting its tests green, spawn the `slice-verifier` subagent** (defined in `.claude/agents/slice-verifier.md`) with the slice name and branch. It reviews the diff for invariant violations, security issues, and code quality, and re-runs the tests itself. Relay its full report to the user. A slice branch does not merge on a `FAIL`; fix the blockers and re-run it.
- **Merge gate (hook-enforced):** a `PreToolUse` hook (`.claude/hooks/slice-merge-gate.sh`, registered in `.claude/settings.json`) blocks merging any `slice-*` branch into `staging` or `main` unless `.claude/verifier-pass/<branch>` exists and contains `PASS`. Non-slice merges (`staging` → `main`, `fix/*`) pass through — verification happens where slice work first lands. Write the marker file (verdict + date + one-line summary) only when relaying a verifier PASS — never to bypass the gate. `.claude/verifier-pass/` is gitignored local state.
- Update ARCHITECTURE.md (and its Decisions log, §10) in the same session as any decision change; keep the delivery-plan slice status current.
- Prefer patterns already in the codebase over new ones.
