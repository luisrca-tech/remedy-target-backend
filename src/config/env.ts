/**
 * Environment contract for the backend service.
 *
 * Values are read lazily so that `typecheck` / `test` (which run without a real
 * environment) never fail on a missing secret. Callers that genuinely need a
 * value (e.g. the DB client) validate at their own boundary via `requireEnv`.
 */

export type AppEnv = {
  DATABASE_URL: string | undefined;
  SENTRY_DSN: string | undefined;
  SENTRY_ENVIRONMENT: string;
  /** The git SHA Railway injects; becomes the Sentry `release`. */
  RAILWAY_GIT_COMMIT_SHA: string | undefined;
  ENABLED_BUGS: string;
  PORT: number;
};

export function readEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  return {
    DATABASE_URL: source.DATABASE_URL,
    SENTRY_DSN: source.SENTRY_DSN,
    SENTRY_ENVIRONMENT: source.SENTRY_ENVIRONMENT ?? "development",
    RAILWAY_GIT_COMMIT_SHA: source.RAILWAY_GIT_COMMIT_SHA,
    ENABLED_BUGS: source.ENABLED_BUGS ?? "",
    // 8000, not 3000: Next.js dev (the sibling frontend) owns 3000 by
    // convention, and both apps run side by side during local development.
    // Railway injects PORT at runtime, so prod is unaffected by this default.
    PORT: source.PORT ? Number(source.PORT) : 8000,
  };
}

export const env: AppEnv = readEnv();

/**
 * Fail-fast accessor for a required variable. Throws with context so a missing
 * secret surfaces loudly at the boundary rather than as a downstream null.
 */
export function requireEnv(key: keyof AppEnv, source: AppEnv = env): string {
  const value = source[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return String(value);
}
