import { execSync } from "node:child_process";

import * as Sentry from "@sentry/node";

import { isBugEnabled } from "../config/enabledBugs.ts";
import { env } from "../config/env.ts";
import { db } from "../db/client.ts";
import { users } from "../db/schema.ts";
import type { User } from "../db/schema.ts";

/**
 * Daily-digest CLI job — the COMMAND harness for Remedy validation.
 *
 * Remedy's `inferHarness` classifies a Sentry incident by tag-sniffing: a `url`
 * or `browser.name` tag routes it to the browser harness, an `http.method` tag
 * routes it to the http harness, and an event carrying NEITHER routes to the
 * `command` harness. This job therefore must never stamp `url` or `http.method`
 * and never import the HTTP middleware — its incidents represent a background
 * CLI run and must land in the command harness.
 *
 * Sentry here is a SEPARATE initialization from the service (`src/instrument.ts`
 * uses `@sentry/bun`); a CLI job runs its own `@sentry/node` client. Like the
 * service init, it is a no-op without `SENTRY_DSN` so tests and local runs never
 * make network calls.
 *
 * Seeded defect BC1 (dormant unless `ENABLED_BUGS` includes "BC1"): the per-user
 * digest dereferences `user.preferences` without a guard. The seeded
 * `usr_null_prefs` row has `preferences = null`, so this throws a `TypeError` at
 * runtime. The error propagates to the job wrapper, which captures it to Sentry
 * at `fatal` level (a real command incident) and exits non-zero. With BC1 off —
 * the default during checks — preferences are read defensively and the job
 * completes and exits 0.
 */

export interface UserDigest {
  userId: string;
  digestOptIn: boolean;
  locale: string;
}

/**
 * Minimal structural surface of the Sentry client the job wrapper needs. Kept as
 * an injected dependency so the wrapper's failure path can be tested with a spy
 * (no real SDK, no network). The real `@sentry/node` client satisfies it.
 */
export interface JobSentry {
  // Method syntax (bivariant params) so the real `@sentry/node` client — whose
  // hint is a wide capture-context union — is assignable to this narrow surface.
  captureException(exception: unknown, hint?: unknown): unknown;
  flush(timeout?: number): Promise<boolean>;
}

/**
 * Build a single user's digest entry. Hosts the BC1 defect.
 */
export function buildUserDigest(user: User): UserDigest {
  if (isBugEnabled("BC1")) {
    // BC1 (seeded defect): unguarded `preferences` dereference. `preferences` is
    // nullable, so this throws a `TypeError` at runtime for `usr_null_prefs`.
    // @ts-expect-error BC1: user.preferences may be null; the unguarded deref is the seeded defect.
    return { userId: user.id, digestOptIn: user.preferences.digestOptIn, locale: user.preferences.locale };
  }

  const preferences = user.preferences;
  return {
    userId: user.id,
    digestOptIn: preferences?.digestOptIn ?? false,
    locale: preferences?.locale ?? "en",
  };
}

/**
 * Load every user and build a digest per user. Throws (propagates) when BC1 is
 * enabled and a null-preferences row is encountered.
 */
export async function runDigest(): Promise<UserDigest[]> {
  const rows = await db.select().from(users);
  return rows.map(buildUserDigest);
}

/**
 * Resolve the git SHA for the Sentry `release`. This job represents a
 * local-checkout run, so it prefers `RAILWAY_GIT_COMMIT_SHA` when present and
 * otherwise reads the checkout head. Returns `undefined` (with a warning) when
 * neither is available; the caller decides whether that is fatal.
 */
function resolveRelease(): string | undefined {
  const injected = env.RAILWAY_GIT_COMMIT_SHA;
  if (injected) {
    return injected;
  }
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`runDigest: could not resolve git SHA from the checkout: ${message}`);
    return undefined;
  }
}

/**
 * Idempotently initialize the job's own Sentry client. No-op (never throws) when
 * `SENTRY_DSN` is empty so tests / local runs stay offline. When a DSN IS set the
 * release must be resolvable — fail loudly rather than emit an untraceable
 * release. Sets a `job` tag (never `url` / `http.method`) so events classify to
 * the command harness.
 */
export function initDigestSentry(): void {
  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  const release = resolveRelease();
  if (!release) {
    throw new Error(
      "runDigest: SENTRY_DSN is set but no git SHA is available for the Sentry release. " +
        "Set RAILWAY_GIT_COMMIT_SHA or run the job inside a git checkout.",
    );
  }

  Sentry.init({
    dsn,
    release,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: 0,
  });
  Sentry.setTag("job", "daily-digest");
}

/**
 * Run the digest and translate the outcome into a process exit code. On any
 * error, capture it to Sentry at `fatal` level and flush before returning 1;
 * on success return 0. Sentry is injected so the failure path is unit-testable.
 */
export async function runDigestJob(sentry: JobSentry): Promise<number> {
  try {
    const digests = await runDigest();
    console.log(`runDigest: built digests for ${digests.length} user(s).`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`runDigest: FATAL — digest job failed: ${message}`);
    sentry.captureException(err, { level: "fatal" });
    await sentry.flush(2000);
    return 1;
  }
}

async function main(): Promise<void> {
  initDigestSentry();
  const exitCode = await runDigestJob(Sentry);
  process.exit(exitCode);
}

if (import.meta.main) {
  void main();
}
