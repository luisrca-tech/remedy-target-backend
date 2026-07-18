/**
 * triggerBC1.ts — Sentry event trigger and command-harness tag verification script
 *
 * This script drives the BC1 bug (daily-digest null-preferences dereference) and
 * verifies that the resulting Sentry incidents carry NEITHER a `url` tag NOR an
 * `http.method` tag. Remedy's `inferHarness` routes an event to the `command`
 * harness ONLY when both are absent — if either leaks in, the command incident
 * silently misroutes to the browser or http harness.
 *
 * Unlike triggerBH1 (which fires HTTP requests at a deployed URL), BC1 is a CLI
 * job: this script SPAWNS the digest job locally with `ENABLED_BUGS=BC1`, which
 * throws, captures a fatal Sentry event, and exits non-zero. It therefore
 * inherits the current environment (`DATABASE_URL`, `SENTRY_DSN`, …) so the
 * spawned job can reach the DB and emit to Sentry.
 *
 * Exit code 0 ONLY when:
 * - At least EVENT_COUNT (default 10) job runs exited non-zero (bug reproduced)
 * - Sentry creds (token, org, project) are provided
 * - The latest Sentry event carries NEITHER `url` NOR `http.method`
 *
 * Exit code non-zero if:
 * - Fewer than EVENT_COUNT job runs failed as designed
 * - Sentry creds are missing (with warning message)
 * - The latest event carries a `url` or `http.method` tag (with loud FAILURE message)
 *
 * Environment variables:
 * - SENTRY_AUTH_TOKEN: Sentry API authentication token. REQUIRED for verification.
 * - SENTRY_ORG: Sentry organization slug. REQUIRED for verification.
 * - SENTRY_PROJECT: Sentry project slug. REQUIRED for verification.
 * - EVENT_COUNT: number of job runs to fire (default: 10). Fires at least this many.
 * - DELAY_MS: delay in ms between runs (default: 100).
 * - SENTRY_API_URL: Sentry API base URL (default: https://sentry.io). Override for self-hosted.
 *
 * The spawned job additionally needs DATABASE_URL and SENTRY_DSN in the ambient
 * environment to actually emit — without SENTRY_DSN the job is a no-op by design.
 */

const DEFAULT_EVENT_COUNT = 10;
const DEFAULT_DELAY_MS = 100;
const DEFAULT_SENTRY_API_URL = "https://sentry.io";

// Tags whose presence would misroute the command incident.
const FORBIDDEN_TAGS = ["url", "http.method"] as const;

// Optional Sentry credentials for tag verification.
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;
const SENTRY_API_URL = process.env.SENTRY_API_URL || DEFAULT_SENTRY_API_URL;

const EVENT_COUNT = parseInt(process.env.EVENT_COUNT || String(DEFAULT_EVENT_COUNT), 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || String(DEFAULT_DELAY_MS), 10);

if (Number.isNaN(EVENT_COUNT) || EVENT_COUNT < 1) {
  console.error("❌ ERROR: EVENT_COUNT must be a positive integer.");
  process.exit(1);
}

/**
 * Spawn the digest job `count` times with `ENABLED_BUGS=BC1`. Returns the number
 * of runs that exited non-zero (the BC1 bug reproducing as designed).
 */
async function fireEvents(count: number): Promise<number> {
  console.log(`🔥 Running the digest job ${count} times with ENABLED_BUGS=BC1...`);

  let failureCount = 0;

  for (let i = 0; i < count; i++) {
    const proc = Bun.spawn(["bun", "run", "src/jobs/runDigest.ts"], {
      env: { ...process.env, ENABLED_BUGS: "BC1" },
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      failureCount++;
      console.log(`  [${i + 1}/${count}] ✓ job exited ${exitCode} (BC1 reproduced)`);
    } else {
      console.log(`  [${i + 1}/${count}] ⚠ job exited 0 (expected non-zero)`);
    }

    if (i < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log(`✅ Job run complete: ${failureCount}/${count} runs failed as designed.`);

  return failureCount;
}

/**
 * Query Sentry for the latest event and assert it carries NEITHER `url` NOR
 * `http.method`. Returns true when the event is clean (command-routable),
 * false otherwise. Throws if the API call fails.
 */
async function verifyNoHttpTags(): Promise<boolean> {
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) {
    console.warn("\n⚠️  WARNING: Sentry credentials incomplete. Tag verification SKIPPED.");
    console.warn(
      "   Provide SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT to verify the command routing tags.",
    );
    return false;
  }

  console.log("\n⏳ Waiting for Sentry ingestion (5 seconds)...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log("📡 Querying Sentry API for latest event...");

  const endpoint = `${SENTRY_API_URL}/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/events/`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sentry API returned ${response.status}: ${body}`);
  }

  const events = (await response.json()) as Array<{
    tags?: Array<{ key: string; value: string }>;
  }>;

  const latestEvent = events?.[0];
  if (!latestEvent) {
    console.error("❌ No events found in Sentry project.");
    return false;
  }

  const tags = latestEvent.tags ?? [];
  const presentForbidden = FORBIDDEN_TAGS.filter((forbidden) =>
    tags.some((tag) => tag.key === forbidden),
  );

  console.log(`   Available tags: ${tags.map((t) => t.key).join(", ") || "none"}`);

  if (presentForbidden.length > 0) {
    console.error(`   Forbidden routing tag(s) present: ${presentForbidden.join(", ")}`);
    return false;
  }

  console.log("✅ Neither `url` nor `http.method` is present — event routes to the command harness.");
  return true;
}

async function main(): Promise<void> {
  console.log("🎯 BC1 Sentry Event Trigger & Command-Harness Tag Verification");
  console.log(`   Job runs to fire: ${EVENT_COUNT}`);
  console.log("");

  const failureCount = await fireEvents(EVENT_COUNT);

  if (failureCount < EVENT_COUNT) {
    console.error(`\n❌ FAILURE: Only ${failureCount}/${EVENT_COUNT} job runs failed as designed.`);
    console.error("   BC1 may not be active, or the job cannot reach the database.");
    process.exit(1);
  }

  const hasCreds = !!(SENTRY_AUTH_TOKEN && SENTRY_ORG && SENTRY_PROJECT);
  if (!hasCreds) {
    console.error("\n❌ FAILURE: Sentry credentials are required to verify the command routing tags.");
    console.error("   Without verification, we cannot confirm the incident routes to the command harness.");
    process.exit(1);
  }

  const clean = await verifyNoHttpTags();
  if (!clean) {
    console.error("\n❌ CATASTROPHIC FAILURE: a `url` or `http.method` tag is present on the Sentry event!");
    console.error("   This means the command incident will silently misroute away from Remedy's command harness.");
    console.error("   The BC1 command harness is incomplete or incorrect.");
    process.exit(1);
  }

  console.log("\n🎉 SUCCESS: BC1 trigger verified with no `url` / `http.method` tags present.");
  console.log("   The command incident will route correctly to Remedy's command harness.");
  process.exit(0);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`❌ Unexpected error: ${message}`);
  process.exit(1);
});
