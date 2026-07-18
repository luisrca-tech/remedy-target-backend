/**
 * triggerX1.ts — X1 negative-control Sentry event emitter and verifier
 *
 * X1 is a NEGATIVE CONTROL for Remedy's severity gate. It emits >= EVENT_COUNT
 * (default 10) `warning`-level Sentry events that carry the `http.method` tag so
 * Remedy's `inferHarness` routes them to the `http` harness — but every event
 * sits BELOW the severity gate. The expected downstream (human-observed) outcome
 * is that Remedy terminates the incident as `ineligible` with an audited reason:
 * no GitHub issue, no PR. See `documentation/x1-negative-control.md`.
 *
 * Unlike `triggerBH1.ts` (which drives a deployed backend over HTTP and lets the
 * server's Sentry SDK emit the incident), THIS script is itself the http-harness
 * emitter: it initializes the Sentry SDK locally and hand-sets the `http.method`
 * scope tag on each captured message. Setting the tag by hand is correct here
 * precisely because the script stands in for the `sentryHttpMethod` middleware —
 * do NOT hand-set that tag anywhere in the service code.
 *
 * Exit code 0 ONLY when:
 * - The SDK was initialized (SENTRY_DSN provided)
 * - At least EVENT_COUNT warning-level events were captured, each carrying the
 *   `http.method` tag (verified locally by construction)
 * - If Sentry API creds are provided, the API confirms warning level, >= EVENT_COUNT
 *   matching events, and the `http.method` tag
 *
 * Exit code non-zero when:
 * - SENTRY_DSN is missing (no-op-safe: capture is disabled, so nothing to verify)
 * - EVENT_COUNT is invalid or < 10 (the severity gate needs a real burst)
 * - The local flush fails
 * - Sentry API creds are provided but the API check fails (loud FAILURE message)
 *
 * Environment variables:
 * - SENTRY_DSN: Sentry DSN the events are emitted to. REQUIRED (no DSN => no-op).
 * - SENTRY_ENVIRONMENT: Sentry environment (default: "development"). Mirrors instrument.ts.
 * - EVENT_COUNT: number of warning events to fire (default: 10, minimum: 10).
 * - DELAY_MS: delay in ms between captures (default: 100).
 * - HTTP_METHOD: value stamped on the `http.method` tag (default: "GET").
 * - SENTRY_AUTH_TOKEN: Sentry API token. If missing, API verification is skipped.
 * - SENTRY_ORG: Sentry organization slug. If missing, API verification is skipped.
 * - SENTRY_PROJECT: Sentry project slug. If missing, API verification is skipped.
 * - SENTRY_API_URL: Sentry API base URL (default: https://sentry.io). Override for self-hosted.
 */

import * as Sentry from "@sentry/bun";

const DEFAULT_EVENT_COUNT = 10;
const MIN_EVENT_COUNT = 10;
const DEFAULT_DELAY_MS = 100;
const DEFAULT_HTTP_METHOD = "GET";
const DEFAULT_SENTRY_API_URL = "https://sentry.io";
const EVENT_LEVEL = "warning" as const;

// SENTRY_DSN is required: without it the SDK is a no-op and there is nothing to
// emit or verify. Fail loudly rather than pretend success.
const SENTRY_DSN = process.env.SENTRY_DSN;
if (!SENTRY_DSN) {
  console.error("❌ ERROR: SENTRY_DSN environment variable is required.");
  console.error(
    "   Without a DSN the Sentry SDK is a no-op, so no warning events can be emitted.",
  );
  console.error(
    "   Usage: SENTRY_DSN=https://<key>@<host>/<project> bun run scripts/triggerX1.ts",
  );
  process.exit(1);
}

const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? "development";
const HTTP_METHOD = process.env.HTTP_METHOD ?? DEFAULT_HTTP_METHOD;

// Optional Sentry API credentials for post-emit verification.
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;
const SENTRY_API_URL = process.env.SENTRY_API_URL || DEFAULT_SENTRY_API_URL;

const EVENT_COUNT = parseInt(
  process.env.EVENT_COUNT || String(DEFAULT_EVENT_COUNT),
  10,
);
const DELAY_MS = parseInt(process.env.DELAY_MS || String(DEFAULT_DELAY_MS), 10);

if (Number.isNaN(EVENT_COUNT) || EVENT_COUNT < MIN_EVENT_COUNT) {
  console.error(
    `❌ ERROR: EVENT_COUNT must be an integer >= ${MIN_EVENT_COUNT} (the severity gate needs a real burst).`,
  );
  process.exit(1);
}

if (Number.isNaN(DELAY_MS) || DELAY_MS < 0) {
  console.error("❌ ERROR: DELAY_MS must be a non-negative integer.");
  process.exit(1);
}

/**
 * Initialize the Sentry SDK for this emitter. Mirrors `src/instrument.ts`:
 * tracing off (this is about error/message incidents), environment carried
 * through. The DSN presence is already guaranteed above.
 */
function initSentry(): void {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
  });
}

/**
 * Fire `count` warning-level messages, hand-stamping the `http.method` tag on a
 * fresh scope per event (this script stands in for the request middleware).
 * Returns the number of events successfully captured.
 */
function fireEvents(count: number): number {
  console.log(
    `🔥 Emitting ${count} "${EVENT_LEVEL}"-level events (http.method="${HTTP_METHOD}")...`,
  );

  let captured = 0;

  for (let i = 0; i < count; i++) {
    const eventId = Sentry.withScope((scope) => {
      scope.setLevel(EVENT_LEVEL);
      // This script IS the http-harness emitter, so hand-setting http.method is
      // correct here — it mirrors what `sentryHttpMethod()` stamps per request.
      scope.setTag("http.method", HTTP_METHOD);
      scope.setTag("negative_control", "X1");
      return Sentry.captureMessage(
        `X1 negative control: warning event ${i + 1}/${count} below severity gate`,
        EVENT_LEVEL,
      );
    });

    if (eventId) {
      captured++;
      console.log(`  [${i + 1}/${count}] ✓ captured ${eventId}`);
    } else {
      console.warn(`  [${i + 1}/${count}] ⚠ capture returned no event id`);
    }
  }

  console.log(`✅ Emit complete: ${captured}/${count} events captured.`);
  return captured;
}

type SentryApiEvent = {
  tags?: Array<{ key: string; value: string }>;
};

/**
 * Query the Sentry API and confirm that recent events match the negative-control
 * shape: `warning` level, `http.method` present, and >= EVENT_COUNT matches.
 * Returns true when confirmed, false otherwise. Never throws — failures are
 * reported and surface as a non-zero exit via the caller.
 */
async function verifyViaApi(): Promise<boolean> {
  console.log("\n⏳ Waiting for Sentry ingestion (5 seconds)...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const endpoint = `${SENTRY_API_URL}/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/events/?query=${encodeURIComponent(
    'negative_control:X1',
  )}`;
  console.log(`📡 Querying Sentry API: ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`❌ Sentry API returned ${response.status}: ${body}`);
      return false;
    }

    const events = (await response.json()) as SentryApiEvent[];
    if (!events || events.length === 0) {
      console.error("❌ No X1 events found in Sentry project yet.");
      return false;
    }

    let matching = 0;
    for (const event of events) {
      const tags = event.tags ?? [];
      const hasHttpMethod = tags.some((t) => t.key === "http.method");
      const levelTag = tags.find((t) => t.key === "level");
      const isWarning = levelTag ? levelTag.value === EVENT_LEVEL : false;
      if (hasHttpMethod && isWarning) {
        matching++;
      }
    }

    console.log(
      `   Found ${matching}/${events.length} returned events with level="${EVENT_LEVEL}" AND http.method present.`,
    );

    if (matching < EVENT_COUNT) {
      console.error(
        `❌ Only ${matching} matching events confirmed via API (need >= ${EVENT_COUNT}).`,
      );
      return false;
    }

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Sentry API query failed: ${message}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log("🎯 X1 Negative-Control Emitter (severity-gate below-threshold)");
  console.log(`   Environment: ${SENTRY_ENVIRONMENT}`);
  console.log(`   Level: ${EVENT_LEVEL}`);
  console.log(`   Events to fire: ${EVENT_COUNT}`);
  console.log("");

  initSentry();

  const captured = fireEvents(EVENT_COUNT);

  // Local assertion: we control emission, so this is authoritative for count and
  // level. Each captured event carried the http.method tag by construction.
  if (captured < EVENT_COUNT) {
    console.error(
      `\n❌ FAILURE: Only ${captured}/${EVENT_COUNT} warning events were captured.`,
    );
    console.error("   The severity-gate burst is incomplete; aborting.");
    await Sentry.flush(2000);
    process.exit(1);
  }
  console.log(
    `\n✔ Local assertion passed: ${captured} "${EVENT_LEVEL}" events captured, each with http.method="${HTTP_METHOD}".`,
  );

  console.log("\n💧 Flushing Sentry buffer...");
  const flushed = await Sentry.flush(5000);
  if (!flushed) {
    console.error(
      "❌ FAILURE: Sentry flush timed out — some events may not have been delivered.",
    );
    process.exit(1);
  }
  console.log("✅ Flush complete.");

  // Optional API confirmation. Mirrors triggerBH1's mechanism (Bearer token,
  // events endpoint). Skipped with a warning when creds are incomplete.
  const hasCreds = !!(SENTRY_AUTH_TOKEN && SENTRY_ORG && SENTRY_PROJECT);
  if (!hasCreds) {
    console.warn(
      "\n⚠️  WARNING: Sentry API credentials incomplete — remote verification SKIPPED.",
    );
    console.warn(
      "   Provide SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT to confirm via the API.",
    );
    console.log(
      "\n🎉 SUCCESS: X1 warning burst emitted (verified locally).",
    );
    console.log(
      "   Expected Remedy outcome: terminal `ineligible` (below severity gate), audited reason, no issue/PR.",
    );
    process.exit(0);
  }

  const apiOk = await verifyViaApi();
  if (!apiOk) {
    console.error(
      "\n❌ FAILURE: Sentry API did not confirm the X1 warning burst.",
    );
    console.error(
      "   Cannot confirm the negative-control events landed with the expected level/tag.",
    );
    process.exit(1);
  }

  console.log(
    "\n🎉 SUCCESS: X1 warning burst emitted and confirmed via Sentry API.",
  );
  console.log(
    "   Expected Remedy outcome: terminal `ineligible` (below severity gate), audited reason, no issue/PR.",
  );
  process.exit(0);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`❌ Unexpected error: ${message}`);
  process.exit(1);
});
