# remedy-target-backend

A deliberately-buggy Hono + Drizzle + PostgreSQL backend designed to validate the Remedy automated incident-remediation system at Phase B fidelity. Emits real Sentry incidents to exercise Remedy's incident classification, GitHub issue creation, and Cursor-based patch generation end-to-end.

## Stack

- **Runtime**: Bun (>=1.3.0)
- **Framework**: Hono 4.x (lightweight HTTP framework)
- **Database**: PostgreSQL (Neon in production, Docker Compose for local dev)
- **ORM**: Drizzle ORM with drizzle-kit migrations
- **Error Tracking**: @sentry/bun for the HTTP service (`src/instrument.ts`) and @sentry/node for the standalone daily-digest CLI job (`src/jobs/runDigest.ts`) — both emit real incidents when a DSN is configured
- **Deployment**: Railway (production; reads `RAILWAY_GIT_COMMIT_SHA` for Sentry release tag)

## What This Is

This service is a **validation harness**, not a production app. Its core purpose is to seed intentional bugs that Remedy will discover, classify, and patch. Every bug is:

1. **Flag-gated OFF by default** via `ENABLED_BUGS` environment variable
2. **Inline-suppressed** (e.g., `@ts-expect-error`) so checks pass green when disabled
3. **Scoped to one HTTP incident or command job per test window** (window discipline)

When a bug flag is active (e.g., `ENABLED_BUGS=BH1`), the code path executes and emits a real Sentry incident tagged with `http.method` (for HTTP incidents). Remedy's `inferHarness` reads this tag to route the incident to the correct harness for patching.

## Harness Routing & Sentry Integration

Every HTTP request carries an `http.method` tag in the Sentry scope (stamped by the `sentryHttpMethod()` middleware before any route handler runs). This is the single correctness-critical affordance:

- **Sentry DSN**: Read from `SENTRY_DSN` env var; if empty/undefined, capture is disabled (safe for local dev / tests).
- **Release**: Derived from `RAILWAY_GIT_COMMIT_SHA` (injected by Railway in production); undefined locally, which is fine.
- **Environment**: Read from `SENTRY_ENVIRONMENT` env var; defaults to `"development"`.

The Sentry SDK is initialized in `src/instrument.ts` before `Bun.serve()` so the SDK can auto-instrument per-request isolation scopes before the first request lands.

## Seeded Bugs

The seeded bug ids (`BH1`, `BH2`, `BC1`) are defined in `src/config/enabledBugs.ts` and selected via the `ENABLED_BUGS` env var (window discipline: exactly one bug flag per validation window, never concurrent). `X1` is a telemetry-only **negative control**, not a code defect — it has no `BugId` entry and no manifest change.

| Id | Kind | Surface | Enable | Harness (tags) | Expected Remedy outcome |
|----|------|---------|--------|----------------|-------------------------|
| **BH1** | Code defect | `GET /orders/:id` | `ENABLED_BUGS=BH1` | HTTP (`http.method` present) | Patch restores non-crashing order read |
| **BH2** | Code defect (contract probe) | `POST /signup` | `ENABLED_BUGS=BH2` | HTTP (`http.method` present) | Patch restores the 400 client-error contract, not just silences the crash |
| **BC1** | Code defect | `bun run job:digest` (`src/jobs/runDigest.ts`) | `ENABLED_BUGS=BC1` | Command (no `url` / `http.method`) | Patch guards the null-preferences deref; job exits 0 |
| **X1** | Negative control (NOT a code defect) | `scripts/triggerX1.ts` telemetry burst | n/a (no flag) | HTTP (`warning` level + `http.method`) | Terminated as `ineligible` (sub-threshold severity); no issue, no PR |

### BH1: HTTP Order Dereference

- **Route**: `GET /orders/:id`
- **Bug**: Dereferencing null `coupon.percentOff` when `coupon` is null → TypeError → 500 HTTP error
- **Repro**: `GET /orders/ord_null_coupon` (seeded order with null coupon)
- **Enable**: `ENABLED_BUGS=BH1`
- **Incident Type**: HTTP (event carries the `http.method` tag)

### BH2: HTTP Signup Contract Probe

- **Route**: `POST /signup` (mounted in `src/app.ts`; accepts JSON `{ email, name? }`)
- **Bug**: With BH2 on, the handler normalizes `body.email` unguarded before boundary validation, so a missing email throws a `TypeError` → app `onError` → Sentry → **500** instead of the correct **400** `ValidationError` body.
- **Contract (BH2 off)**: missing/invalid email → 400 `{ error, field }` (via `src/errors/ValidationError.ts`); valid payload → 201.
- **Repro**: `POST /signup` with body `{}` (no email)
- **Enable**: `ENABLED_BUGS=BH2`
- **Incident Type**: HTTP (event carries the `http.method` tag)
- **Patch-quality probe**: a valid remediation must RESTORE the 400 contract, not merely swallow the exception. See `documentation/bh2-contract-probe.md`.

### BC1: Command Daily Digest

- **Job**: Daily-digest CLI job — `bun run job:digest` (`src/jobs/runDigest.ts`)
- **Bug**: With BC1 on, `buildUserDigest` dereferences `user.preferences` unguarded; the seeded `usr_null_prefs` row has `preferences = null`, so it throws a `TypeError`. The wrapper captures it to Sentry at `fatal` level and the process **exits non-zero**.
- **Command-harness contract**: the job runs its own `@sentry/node` client and must never stamp `url` or `http.method`, so `inferHarness` routes the incident to the **command** harness. With BC1 off the job reads preferences defensively and exits 0.
- **Enable**: `ENABLED_BUGS=BC1`
- **Incident Type**: Command (event carries NEITHER `url` NOR `http.method`)

### X1: Severity-Gate Negative Control (not a code defect)

- **Kind**: Telemetry-only negative control — no route, no `BugId`, no manifest change. Nothing in the service behaves differently.
- **What it emits**: `scripts/triggerX1.ts` fires ≥10 `warning`-level Sentry events, each hand-stamped with the `http.method` tag (correctly HTTP-routable). The events are well-formed; the ONLY disqualifier is their sub-threshold severity.
- **Expected outcome**: Remedy terminates the incident as `ineligible` (warning below the severity gate) with an audited reason — no GitHub issue, no PR. Human-observed after running the trigger. See `documentation/x1-negative-control.md`.

## Command Harness: Daily Digest

`bun run job:digest` runs the standalone daily-digest job (`src/jobs/runDigest.ts`). It is the **command harness** counterpart to the HTTP routes:

- Initializes its **own** `@sentry/node` client (separate from the service's `@sentry/bun` init) — a no-op without `SENTRY_DSN`, so tests and local runs stay offline.
- Sets a `job` tag and **never** stamps `url` or `http.method`, so incidents classify to the command harness.
- Requires a resolvable release when a DSN is set (prefers `RAILWAY_GIT_COMMIT_SHA`, else the checkout `git rev-parse HEAD`); fails loudly otherwise.
- On any error it captures to Sentry at `fatal` level, flushes, and **exits non-zero**; on success it exits 0.

## Trigger Scripts

Each seeded bug (and the X1 control) has an emitter under `scripts/` that drives it and verifies the Sentry event's routing tags. See `scripts/README.md` for full env-var and exit-code contracts. Summary:

- `scripts/triggerBH1.ts` — fires `GET /orders/ord_null_coupon` at a deployed `TARGET_URL`; asserts `http.method` **present**.
- `scripts/triggerBH2.ts` — fires email-less `POST /signup` at `TARGET_URL`, expects 500s; asserts `http.method` **present**.
- `scripts/triggerBC1.ts` — spawns `job:digest` locally with `ENABLED_BUGS=BC1`, expects non-zero exits; asserts `url` and `http.method` **both absent**.
- `scripts/triggerX1.ts` — emits the warning burst directly via `SENTRY_DSN`; asserts `warning` level + `http.method` present.

## Local Development

### Prerequisites

- Bun (>=1.3.0)
- Docker & Docker Compose (for PostgreSQL)

### Setup

```bash
# Install dependencies
bun install

# Start PostgreSQL (in background)
docker compose up -d

# Generate migrations (from schema)
bun run db:generate

# Run migrations
bun run db:migrate

# Seed test tenant (remedy-target-test)
bun run db:seed
```

### Running

```bash
# Development server (hot reload)
bun run dev

# Production-like start
bun run start
```

Server listens on `http://localhost:3000` (configurable via `PORT` env var).

### Environment Contract

Copy `.env.example` to `.env` and set values:

```bash
# Database
DATABASE_URL=postgres://remedy:remedy@localhost:5432/remedy_target

# Sentry (leave empty for local dev)
SENTRY_DSN=
SENTRY_ENVIRONMENT=development

# Release marker (Railway injects this in prod)
RAILWAY_GIT_COMMIT_SHA=

# Bug selection (empty during checks). Forms: BH1 | ALL | ALL,BH2 | ALL,-BH2
# Without ALL, ids are includes; with ALL, a bare id excludes it.
# A live Remedy window must enable EXACTLY ONE bug; ALL is local-dev only.
ENABLED_BUGS=

# Server port
PORT=3000
```

## Checks

All checks must pass **green with default/empty `ENABLED_BUGS`** (all bugs disabled):

```bash
# Typecheck
bun run typecheck

# Lint (includes no-silent-failures and ESLint rules)
bun run lint

# Tests (Bun test runner)
bun run test
```

**Verify before committing**: `bun run test && bun run typecheck && bun run lint`

## Database Schema

Seeded tables for the test tenant (`remedy-target-test`):

### users

- **id** (text, PK): e.g., `usr_ok`, `usr_null_prefs`
- **email** (text): e.g., `ok@example.com`
- **preferences** (jsonb, nullable): `{ digestOptIn: boolean; locale: string }` (null on `usr_null_prefs` — the BC1 repro row)
- **address** (jsonb, nullable): `{ street: string; zip: string | null }`
- **tenantId** (text): Always `remedy-target-test`

### orders

- **id** (text, PK): e.g., `ord_ok`, `ord_null_coupon`
- **userId** (text): Foreign key reference
- **coupon** (jsonb, nullable): `{ code: string; percentOff: number }` (null for BH1 repro)
- **total** (int): Order total in cents
- **tenantId** (text)

### products

- **id** (text, PK): e.g., `prd_ok`, `prd_empty_cat`
- **name** (text)
- **category** (text): Empty string `""` for one seed row (`prd_empty_cat`) — an edge-case fixture; not currently read by any active bug
- **tenantId** (text)

Seed rows are set up by `bun run db:seed`.

## Repository Hygiene

- **Import extensions**: All imports use `.ts` extension (ESM bundler mode).
- **Type imports**: Use `import type { X }` for types only.
- **Error handling**: No silent failures (no empty catch blocks); all errors must be logged or propagated.
- **Comments**: Explain "why" not "what"; load-bearing comments (Sentry wiring, window discipline) are preserved even if code is refactored.

## Window Discipline (Critical)

A **test window** is one validation run of Remedy with exactly one seeded bug enabled. Windows are **serialized, never concurrent**:

1. Enable one bug: `ENABLED_BUGS=BH1` (or `BH2`, `BC1`)
2. Commit and push the marker change
3. Run Remedy's validation (Cursor step) against the new commit SHA
4. Disable the bug and reset to default state
5. Repeat for the next bug

Concurrent windows corrupt the shared Remedy workspace. **Always serialize.**

> `ENABLED_BUGS` also accepts `ALL` and `ALL,<id>` (all-except) for **local
> exploration only**. Never run a Remedy window on a multi-bug selection — a
> window enables exactly one bug.

## Further Reading

- `src/instrument.ts` — Sentry initialization and no-op behavior
- `src/middleware/sentryHttpMethod.ts` — HTTP method tag stamping
- `src/config/enabledBugs.ts` — Bug flag gating logic
- `src/db/schema.ts` — Data model with nullable load-bearing fields
- `src/db/seed.ts` — Test tenant seeding
- `src/routes/signup.ts` — `POST /signup` route hosting the BH2 contract defect
- `src/jobs/runDigest.ts` — Daily-digest command harness hosting the BC1 defect
- `src/errors/ValidationError.ts` — Domain error backing the BH2 400 contract
- `documentation/bh2-contract-probe.md` — BH2 contract-probe grading criteria
- `documentation/x1-negative-control.md` — X1 severity-gate negative control
- `scripts/README.md` — Trigger-script env vars, exit codes, and tag assertions
- `remediation.manifest.json` — Remedy harness configuration (routes, checks, fixtures)
