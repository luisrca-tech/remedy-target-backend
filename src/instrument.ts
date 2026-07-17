import * as Sentry from "@sentry/bun";

import { env } from "./config/env.ts";

/**
 * Sentry initialization for the backend.
 *
 * Correctness note: this service exists to emit REAL Sentry incidents that
 * Remedy classifies. The `http.method` scope tag (stamped per request by the
 * `sentryHttpMethod` middleware) is what lets Remedy's `inferHarness` route an
 * HTTP incident to the `http` harness instead of `command`. That machinery is
 * only meaningful once the SDK is initialized here.
 *
 * Import this module at the very top of `src/index.ts` and call `initSentry()`
 * before `Bun.serve` so the Bun SDK can auto-instrument the server (per-request
 * isolation scopes) before the first request lands.
 */

let initialized = false;

/**
 * Idempotently initialize Sentry.
 *
 * No-op (never throws) when `SENTRY_DSN` is empty/undefined so that tests and
 * local runs — which have no DSN — stay green and never attempt network calls.
 */
export function initSentry(): void {
  if (initialized) {
    return;
  }

  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    // No DSN configured (tests / local dev): capture is disabled by design.
    return;
  }

  Sentry.init({
    dsn,
    // Railway injects the git SHA in prod; undefined locally, which is fine.
    release: env.RAILWAY_GIT_COMMIT_SHA,
    environment: env.SENTRY_ENVIRONMENT,
    // This service is about error incidents, not performance; keep tracing off.
    tracesSampleRate: 0,
  });

  initialized = true;
}
