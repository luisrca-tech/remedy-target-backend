# remedy-target-backend

A deliberately-buggy Hono + Drizzle + PostgreSQL backend designed to validate the Remedy automated incident-remediation system at Phase B fidelity. Emits real Sentry incidents to exercise Remedy's incident classification, GitHub issue creation, and Cursor-based patch generation end-to-end.

## Stack

- **Runtime**: Bun (>=1.3.0)
- **Framework**: Hono 4.x (lightweight HTTP framework)
- **Database**: PostgreSQL (Neon in production, Docker Compose for local dev)
- **ORM**: Drizzle ORM with drizzle-kit migrations
- **Error Tracking**: @sentry/bun (emits real incidents when DSN is configured)
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

All bugs are defined in `src/config/enabledBugs.ts` and stored in the `ENABLED_BUGS` env var (window discipline: exactly one bug flag per validation window, never concurrent).

### BH1: HTTP Order Dereference

- **Route**: `GET /orders/:id`
- **Bug**: Dereferencing null `coupon.percentOff` when `coupon` is null → TypeError → 500 HTTP error
- **Repro**: `GET /orders/ord_null_coupon` (seeded order with null coupon)
- **Enable**: `ENABLED_BUGS=BH1`
- **Incident Type**: HTTP

### BH2: HTTP Signup Contract (Phase 2)

- **Route**: `POST /signup`
- **Bug**: Returns 500 instead of 400 on missing email field
- **Enable**: `ENABLED_BUGS=BH2`
- **Incident Type**: HTTP
- **Status**: Scaffolded, not yet in route handlers

### BC1: Command Daily Digest (Phase 2)

- **Job**: Daily digest cron job (`src/jobs/runDigest.ts`)
- **Bug**: Crashes when processing a user with null `preferences`
- **Enable**: `ENABLED_BUGS=BC1`
- **Incident Type**: Command
- **Status**: Scaffolded, not yet implemented

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

# Bug selection (window discipline; empty during checks)
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
- **preferences** (jsonb, nullable): `{ digestOptIn: boolean; locale: string }` (null for BH2 repro)
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
- **category** (text): Empty string `""` for one seed row (BC1 load-bearing)
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

## Further Reading

- `src/instrument.ts` — Sentry initialization and no-op behavior
- `src/middleware/sentryHttpMethod.ts` — HTTP method tag stamping
- `src/config/enabledBugs.ts` — Bug flag gating logic
- `src/db/schema.ts` — Data model with nullable load-bearing fields
- `src/db/seed.ts` — Test tenant seeding
- `remediation.manifest.json` — Remedy harness configuration (routes, checks, fixtures)
