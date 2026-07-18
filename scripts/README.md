# Scripts

Utility scripts for testing and triggering incidents in the remedy-target-backend.

Each script drives one seeded bug (or the X1 negative control) and verifies the
Sentry event's **routing tags** so the incident lands in the correct Remedy
harness. The tag assertion per script:

| Script | Bug | Drives | Tag assertion |
|--------|-----|--------|---------------|
| `triggerBH1.ts` | BH1 | `GET /orders/ord_null_coupon` at `TARGET_URL` | `http.method` **present** (http harness) |
| `triggerBH2.ts` | BH2 | email-less `POST /signup` at `TARGET_URL`, expects 500s | `http.method` **present** (http harness) |
| `triggerBC1.ts` | BC1 | spawns `job:digest` locally with `ENABLED_BUGS=BC1`, expects non-zero exits | `url` and `http.method` **both absent** (command harness) |
| `triggerX1.ts` | X1 (negative control) | emits a `warning` burst directly via `SENTRY_DSN` | `warning` level **and** `http.method` present (http harness, sub-threshold severity) |

All four are secret-free (credentials come from env vars only) and are fully
runnable only against a live deployment / valid Sentry credentials.

## triggerBH1.ts

Drives the BH1 bug (null-coupon order processing) and verifies Sentry event tags.

**Purpose:** Validate that HTTP incidents triggered by the BH1 bug carry the `http.method` tag. Without this tag, incidents silently misroute to Remedy's command harness instead of the HTTP harness.

**Usage:**

```bash
# Minimal: fire events without tag verification (exits non-zero; warning printed)
TARGET_URL=https://xxx.railway.app bun run scripts/triggerBH1.ts

# Full: fire events and verify the http.method tag
TARGET_URL=https://xxx.railway.app \
  SENTRY_AUTH_TOKEN=<token> \
  SENTRY_ORG=<org-slug> \
  SENTRY_PROJECT=<project-slug> \
  bun run scripts/triggerBH1.ts
```

**Environment Variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TARGET_URL` | **Yes** | — | Deployed backend base URL (e.g., `https://xxx.railway.app`) |
| `SENTRY_AUTH_TOKEN` | No | — | Sentry API authentication token. If missing, tag verification is skipped. |
| `SENTRY_ORG` | No | — | Sentry organization slug. If missing, tag verification is skipped. |
| `SENTRY_PROJECT` | No | — | Sentry project slug. If missing, tag verification is skipped. |
| `EVENT_COUNT` | No | `10` | Number of events to fire (must be >= 1). |
| `DELAY_MS` | No | `100` | Delay in milliseconds between requests. |
| `SENTRY_API_URL` | No | `https://sentry.io` | Sentry API base URL (override for self-hosted instances). |

**Exit Codes:**

- **0** — Success: fired >=10 events, all returned HTTP 500, and Sentry tag verification confirmed `http.method` is present.
- **Non-zero** — Failure:
  - Fewer than `EVENT_COUNT` requests returned HTTP 500.
  - Sentry credentials are incomplete (warning printed).
  - The `http.method` tag is missing from the Sentry event (catastrophic failure message printed).

**Notes:**

- This script will not be fully runnable until Phase 2 (requires a live deployed backend and valid Sentry credentials).
- The script has no hardcoded secrets; all credentials come from environment variables.
- Network requests between firings can be controlled via `DELAY_MS` to avoid overwhelming the target.

## triggerBH2.ts

Drives the BH2 bug (signup-contract violation) and verifies the resulting HTTP incident carries the `http.method` tag.

**Purpose:** Fire ≥`EVENT_COUNT` email-less `POST /signup` requests, expect HTTP 500 (the broken behavior a live window exercises), then confirm via the Sentry API that the event carries `http.method` so it routes to the http harness.

**Usage:**

```bash
TARGET_URL=https://xxx.railway.app \
  SENTRY_AUTH_TOKEN=<token> \
  SENTRY_ORG=<org-slug> \
  SENTRY_PROJECT=<project-slug> \
  bun run scripts/triggerBH2.ts
```

**Environment Variables:** Same as `triggerBH1.ts` — `TARGET_URL` (**required**), optional `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` (tag verification skipped if incomplete), `EVENT_COUNT` (default `10`), `DELAY_MS` (default `100`), `SENTRY_API_URL` (default `https://sentry.io`).

**Tag assertion:** `http.method` must be **present** on the latest Sentry event.

**Exit Codes:**

- **0** — ≥`EVENT_COUNT` requests returned HTTP 500, creds provided, and the `http.method` tag is confirmed present.
- **Non-zero** — Fewer than `EVENT_COUNT` 500s, incomplete Sentry creds (warning), or the `http.method` tag is absent (loud FAILURE message).

## triggerBC1.ts

Drives the BC1 bug (daily-digest null-preferences dereference) and verifies the command incident carries **neither** `url` **nor** `http.method`.

**Purpose:** Unlike the HTTP triggers, BC1 is a CLI job. This script spawns `bun run src/jobs/runDigest.ts` `EVENT_COUNT` times with `ENABLED_BUGS=BC1`; each run throws, captures a `fatal` Sentry event, and exits non-zero. It then confirms via the Sentry API that the latest event carries neither routing tag, so `inferHarness` routes it to the **command** harness.

**Usage:**

```bash
# The spawned job inherits the ambient env; it needs DATABASE_URL and SENTRY_DSN
# to actually reach the DB and emit (without SENTRY_DSN the job is a no-op).
DATABASE_URL=postgres://... \
  SENTRY_DSN=https://<key>@<host>/<project> \
  SENTRY_AUTH_TOKEN=<token> \
  SENTRY_ORG=<org-slug> \
  SENTRY_PROJECT=<project-slug> \
  bun run scripts/triggerBC1.ts
```

**Environment Variables:** `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` (required for verification), `EVENT_COUNT` (default `10`), `DELAY_MS` (default `100`), `SENTRY_API_URL` (default `https://sentry.io`). The spawned job additionally needs `DATABASE_URL` and `SENTRY_DSN` in the ambient environment.

**Tag assertion:** `url` and `http.method` must **both be absent** from the latest Sentry event.

**Exit Codes:**

- **0** — ≥`EVENT_COUNT` job runs exited non-zero, creds provided, and neither `url` nor `http.method` is present.
- **Non-zero** — Fewer than `EVENT_COUNT` runs failed as designed, incomplete Sentry creds, or a `url`/`http.method` tag is present (catastrophic misroute message).

## triggerX1.ts

Emits the X1 severity-gate **negative control** — a `warning`-level burst that is well-formed and correctly routed but sub-threshold in severity. X1 is **not a code defect**; see `documentation/x1-negative-control.md`.

**Purpose:** This script is itself the http-harness emitter — it initializes the Sentry SDK locally and hand-stamps `http.method` on each captured message (correct *only here*, standing in for the `sentryHttpMethod()` middleware; never hand-set that tag in service code). It fires ≥`EVENT_COUNT` (minimum `10`) `warning`-level events and, when API creds are provided, confirms level + tag via the Sentry API.

**Usage:**

```bash
SENTRY_DSN=https://<key>@<host>/<project> \
  SENTRY_AUTH_TOKEN=<token> \
  SENTRY_ORG=<org-slug> \
  SENTRY_PROJECT=<project-slug> \
  bun run scripts/triggerX1.ts
```

**Environment Variables:** `SENTRY_DSN` (**required** — no DSN means a no-op SDK and non-zero exit), `SENTRY_ENVIRONMENT` (default `development`), `EVENT_COUNT` (default/minimum `10`), `DELAY_MS` (default `100`), `HTTP_METHOD` (value stamped on the tag, default `GET`), optional `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT`, `SENTRY_API_URL` (default `https://sentry.io`).

**Tag assertion:** each event is `warning` level **and** carries `http.method` (present by construction; API-confirmed when creds are supplied).

**Exit Codes:**

- **0** — SDK initialized, ≥`EVENT_COUNT` warning events captured (each carrying `http.method`), buffer flushed, and — when creds are provided — the API confirmed level and tag.
- **Non-zero** — `SENTRY_DSN` missing (no-op), `EVENT_COUNT` invalid or `< 10`, flush timed out, or an API check failed.
