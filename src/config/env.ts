/**
 * Environment contract for the API.
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
  /** Comma-separated rollout flags; see `config/rollout.ts`. */
  ROLLOUT_FLAGS: string;
  PORT: number;
  /**
   * Browser origins allowed to call this API cross-origin, comma-separated.
   * The storefront calls these endpoints straight from the browser, so its
   * deployed origin must be listed here in production.
   */
  CORS_ORIGINS: string[];
};

/** Local storefront dev server origin. */
const DEFAULT_CORS_ORIGINS = ["http://localhost:3000"];

function parseCorsOrigins(raw: string | undefined): string[] {
  const parsed = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return parsed.length > 0 ? parsed : DEFAULT_CORS_ORIGINS;
}

export function readEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  return {
    DATABASE_URL: source.DATABASE_URL,
    SENTRY_DSN: source.SENTRY_DSN,
    SENTRY_ENVIRONMENT: source.SENTRY_ENVIRONMENT ?? "development",
    RAILWAY_GIT_COMMIT_SHA: source.RAILWAY_GIT_COMMIT_SHA,
    ROLLOUT_FLAGS: source.ROLLOUT_FLAGS ?? "",
    // 8000, not 3000: the storefront dev server owns 3000 and the two run side
    // by side locally. Railway injects PORT at runtime.
    PORT: source.PORT ? Number(source.PORT) : 8000,
    CORS_ORIGINS: parseCorsOrigins(source.CORS_ORIGINS),
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
