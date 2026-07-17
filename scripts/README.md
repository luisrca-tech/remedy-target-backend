# Scripts

Utility scripts for testing and triggering incidents in the remedy-target-backend.

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
