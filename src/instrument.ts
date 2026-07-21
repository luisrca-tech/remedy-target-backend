import * as Sentry from "@sentry/bun";

import { env } from "./config/env.ts";

/**
 * Sentry initialization for the API.
 *
 * Import this at the very top of `src/index.ts` and call `initSentry()` before
 * `Bun.serve`, so the Bun SDK can instrument the server (per-request isolation
 * scopes) before the first request lands.
 */

let initialized = false;

/**
 * No-op (never throws) when `SENTRY_DSN` is empty, so tests and local runs stay
 * offline.
 */
export function initSentry(): void {
  if (initialized) {
    return;
  }

  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    release: env.RAILWAY_GIT_COMMIT_SHA,
    environment: env.SENTRY_ENVIRONMENT,
    // This service reports errors, not performance.
    tracesSampleRate: 0,
  });

  initialized = true;
}
