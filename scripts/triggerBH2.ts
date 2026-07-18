/**
 * triggerBH2.ts — Sentry event trigger and http.method tag verification script
 *
 * This script drives the BH2 bug (signup contract violation) and verifies that
 * the resulting Sentry HTTP incident carries the http.method tag. Without this
 * tag, the incident silently misroutes to Remedy's command harness.
 *
 * BH2's correct contract is that `POST /signup` with a missing/invalid email
 * returns 400. The seeded defect normalizes the absent email before validating,
 * throwing a TypeError -> onError -> Sentry -> 500. This script fires signup
 * requests WITHOUT an email and expects 500s (the broken behavior a live window
 * exercises), then confirms the incident is tagged for the http harness.
 *
 * Exit code 0 ONLY when:
 * - At least EVENT_COUNT (default 10) requests fired to the signup endpoint
 * - At least EVENT_COUNT returned HTTP 500
 * - Sentry creds (token, org, project) are provided
 * - The latest Sentry event contains the http.method tag
 *
 * Exit code non-zero if:
 * - Fewer than EVENT_COUNT 500s received
 * - Sentry creds are missing (with warning message)
 * - The http.method tag is absent (with loud FAILURE message)
 *
 * Environment variables:
 * - TARGET_URL: deployed backend base URL (e.g., https://xxx.railway.app). REQUIRED.
 * - SENTRY_AUTH_TOKEN: Sentry API authentication token. REQUIRED for verification.
 * - SENTRY_ORG: Sentry organization slug. REQUIRED for verification.
 * - SENTRY_PROJECT: Sentry project slug. REQUIRED for verification.
 * - EVENT_COUNT: number of events to fire (default: 10). Fires at least this many.
 * - DELAY_MS: delay in ms between requests (default: 100). Controls request rate.
 * - SENTRY_API_URL: Sentry API base URL (default: https://sentry.io). Override for self-hosted.
 */

const DEFAULT_EVENT_COUNT = 10;
const DEFAULT_DELAY_MS = 100;
const DEFAULT_SENTRY_API_URL = "https://sentry.io";

// Ensure TARGET_URL is provided.
const TARGET_URL = process.env.TARGET_URL;
if (!TARGET_URL) {
  console.error("❌ ERROR: TARGET_URL environment variable is required.");
  console.error("   Usage: TARGET_URL=https://xxx.railway.app bun run scripts/triggerBH2.ts");
  process.exit(1);
}

// Optional Sentry credentials for tag verification.
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;
const SENTRY_API_URL = process.env.SENTRY_API_URL || DEFAULT_SENTRY_API_URL;

// Script configuration.
const EVENT_COUNT = parseInt(process.env.EVENT_COUNT || String(DEFAULT_EVENT_COUNT), 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || String(DEFAULT_DELAY_MS), 10);

if (Number.isNaN(EVENT_COUNT) || EVENT_COUNT < 1) {
  console.error("❌ ERROR: EVENT_COUNT must be a positive integer.");
  process.exit(1);
}

/**
 * Fire HTTP 500 events by POSTing an email-less body to the signup endpoint.
 * Returns the count of HTTP 500 responses received.
 */
async function fireEvents(count: number): Promise<number> {
  console.log(`🔥 Firing ${count} email-less POSTs to ${TARGET_URL}/signup...`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < count; i++) {
    try {
      const response = await fetch(`${TARGET_URL}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "triggerBH2/1.0",
        },
        body: JSON.stringify({ name: "BH2 probe" }),
      });

      if (response.status === 500) {
        successCount++;
        console.log(`  [${i + 1}/${count}] ✓ HTTP 500`);
      } else {
        console.log(`  [${i + 1}/${count}] ⚠ HTTP ${response.status} (expected 500)`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [${i + 1}/${count}] ✗ Request failed: ${message}`);
      errorCount++;
    }

    if (i < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log(
    `✅ Event fire complete: ${successCount} HTTP 500, ${errorCount} errors out of ${count} requests.`,
  );

  return successCount;
}

/**
 * Query Sentry API for the latest event and check for the http.method tag.
 * Returns true if the tag exists, false otherwise. Throws if the API call fails.
 */
async function verifyHttpMethodTag(): Promise<boolean> {
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) {
    console.warn("\n⚠️  WARNING: Sentry credentials incomplete. Tag verification SKIPPED.");
    console.warn(
      "   Provide SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT to verify the http.method tag.",
    );
    return false;
  }

  console.log("\n⏳ Waiting for Sentry ingestion (5 seconds)...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log(`📡 Querying Sentry API for latest event...`);

  const endpoint = `${SENTRY_API_URL}/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/events/`;

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
      throw new Error(`Sentry API returned ${response.status}: ${body}`);
    }

    const events = (await response.json()) as Array<{
      tags?: Array<{ key: string; value: string }>;
    }>;

    if (!events || events.length === 0) {
      console.error("❌ No events found in Sentry project.");
      return false;
    }

    const latestEvent = events[0];
    if (!latestEvent) {
      console.error("❌ No latest event available.");
      return false;
    }

    if (!latestEvent.tags) {
      console.error("❌ Latest event has no tags field.");
      return false;
    }

    const hasHttpMethod = latestEvent.tags.some((tag) => tag.key === "http.method");

    if (hasHttpMethod) {
      const methodTag = latestEvent.tags.find((tag) => tag.key === "http.method");
      console.log(`✅ Tag found: http.method = "${methodTag?.value}"`);
    } else {
      console.log(
        `   Available tags: ${latestEvent.tags.map((t) => t.key).join(", ") || "none"}`,
      );
    }

    return hasHttpMethod;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Sentry API query failed: ${message}`);
    return false;
  }
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  console.log("🎯 BH2 Sentry Event Trigger & Tag Verification");
  console.log(`   Target: ${TARGET_URL}`);
  console.log(`   Events to fire: ${EVENT_COUNT}`);
  console.log("");

  const successCount = await fireEvents(EVENT_COUNT);

  if (successCount < EVENT_COUNT) {
    console.error(`\n❌ FAILURE: Only ${successCount}/${EVENT_COUNT} requests returned HTTP 500.`);
    console.error("   BH2 bug may not be active or the endpoint is unreachable.");
    console.error(
      "   (With BH2 off, the endpoint correctly returns 400 — that is the contract, not a 500.)",
    );
    process.exit(1);
  }

  const hasCreds = !!(SENTRY_AUTH_TOKEN && SENTRY_ORG && SENTRY_PROJECT);
  if (!hasCreds) {
    console.error("\n❌ FAILURE: Sentry credentials are required to verify the http.method tag.");
    console.error("   Without verification, we cannot confirm the incident will be routed correctly.");
    process.exit(1);
  }

  const tagExists = await verifyHttpMethodTag();
  if (!tagExists) {
    console.error("\n❌ CATASTROPHIC FAILURE: http.method tag is MISSING from the Sentry event!");
    console.error("   This means the HTTP incident will silently misroute to Remedy's command harness.");
    console.error("   The BH2 remediation is incomplete or incorrect.");
    process.exit(1);
  }

  console.log("\n🎉 SUCCESS: BH2 trigger verified with http.method tag present.");
  console.log("   The HTTP incident will route correctly to Remedy's http harness.");
  process.exit(0);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`❌ Unexpected error: ${message}`);
  process.exit(1);
});
