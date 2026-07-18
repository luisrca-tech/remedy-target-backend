# X1 — Severity-Gate Negative Control

## What it is

X1 is a **negative control** for Remedy's severity gate. It is **not a code
defect**: there is no route change, no `BugId` union entry, and no
`remediation.manifest.json` change. Nothing in the service behaves differently
because of X1.

Instead, X1 is a burst of Sentry telemetry designed to sit **just below** the
severity threshold that makes an incident eligible for remediation:

- **>= 10 events** (a real burst, so volume is not the reason it is rejected).
- **`warning` level** — deliberately below the severity gate (which admits
  `error`/`fatal`-class incidents).
- Each event carries the **`http.method` tag**, so Remedy's `inferHarness`
  routes it to the **`http` harness** (the same harness a real HTTP incident
  would use). Routing is correct on purpose — we are isolating the severity gate,
  not the routing logic.

The point of a negative control is to prove the gate rejects for the *right*
reason: the events are well-formed and correctly routed, and the **only** thing
disqualifying them is their sub-threshold severity.

## Expected Remedy outcome

Remedy should **terminate the incident as `ineligible`** with an **audited
reason** referencing the severity gate (warning level below threshold):

- **No GitHub issue** is opened.
- **No pull request** is created.
- The termination is recorded/audited so the decision is observable later.

This outcome is **human-observed** after running the trigger — the script itself
only emits and verifies the telemetry shape; it does not assert Remedy's
decision.

## How to run the trigger

The emitter lives at `scripts/triggerX1.ts`. Unlike `triggerBH1.ts` (which drives
a deployed backend over HTTP), this script **is itself the `http`-harness
emitter**: it initializes the Sentry SDK locally and hand-stamps the
`http.method` tag on each captured message. Hand-setting the tag is correct
*only here*, because the script stands in for the `sentryHttpMethod()`
middleware — never hand-set that tag in service code.

```bash
# Minimal: emit the warning burst and verify locally (no API round-trip).
SENTRY_DSN=https://<key>@<host>/<project> \
  bun run scripts/triggerX1.ts

# Full: emit and additionally confirm level + http.method via the Sentry API.
SENTRY_DSN=https://<key>@<host>/<project> \
  SENTRY_AUTH_TOKEN=<token> \
  SENTRY_ORG=<org-slug> \
  SENTRY_PROJECT=<project-slug> \
  bun run scripts/triggerX1.ts
```

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENTRY_DSN` | **Yes** | — | DSN the warning events are emitted to. Without it the SDK is a no-op and the script exits non-zero. |
| `SENTRY_ENVIRONMENT` | No | `development` | Sentry environment (mirrors `src/instrument.ts`). |
| `EVENT_COUNT` | No | `10` | Number of warning events to fire (minimum `10`). |
| `DELAY_MS` | No | `100` | Delay in ms between captures. |
| `HTTP_METHOD` | No | `GET` | Value stamped on the `http.method` tag. |
| `SENTRY_AUTH_TOKEN` | No | — | Sentry API token. If missing, API verification is skipped. |
| `SENTRY_ORG` | No | — | Sentry organization slug. If missing, API verification is skipped. |
| `SENTRY_PROJECT` | No | — | Sentry project slug. If missing, API verification is skipped. |
| `SENTRY_API_URL` | No | `https://sentry.io` | Sentry API base URL (override for self-hosted). |

### Exit codes

- **0** — The SDK initialized, `>= EVENT_COUNT` warning events were captured
  (each carrying `http.method` by construction), the buffer flushed, and — when
  API creds are provided — the Sentry API confirmed the level and tag.
- **Non-zero** — `SENTRY_DSN` missing (no-op), `EVENT_COUNT` invalid or `< 10`,
  the flush timed out, or API creds were provided but the API check failed.
