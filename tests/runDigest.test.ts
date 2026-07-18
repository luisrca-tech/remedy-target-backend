import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Tests for the daily-digest CLI job (the command harness).
 *
 * The `db` module is fully mocked so no real Postgres connection is attempted —
 * the suite stays green without a database. The job's own Sentry client is
 * injected into `runDigestJob`, so the failure path (fatal capture + flush +
 * non-zero exit) is exercised with a spy, never the real SDK and never a network
 * call.
 */

let currentRows: Array<Record<string, unknown>> = [];

mock.module("../src/db/client.ts", () => ({
  db: {
    select: () => ({
      from: () => Promise.resolve(currentRows),
    }),
  },
}));

const { runDigest, runDigestJob } = await import("../src/jobs/runDigest.ts");

const OK_USER = { id: "usr_ok", preferences: { digestOptIn: true, locale: "en" } };
const NULL_PREFS_USER = { id: "usr_null_prefs", preferences: null };

// Force a deterministic bug selection regardless of the ambient environment.
// Bun auto-loads `.env`, which may set `ENABLED_BUGS` (e.g. `ALL`); these tests
// must not inherit it.
const savedEnabledBugs = process.env.ENABLED_BUGS;

function setEnabledBugs(value: string): void {
  process.env.ENABLED_BUGS = value;
}

afterEach(() => {
  if (savedEnabledBugs === undefined) {
    delete process.env.ENABLED_BUGS;
  } else {
    process.env.ENABLED_BUGS = savedEnabledBugs;
  }
});

describe("runDigest (BC1 dormant)", () => {
  beforeEach(() => {
    setEnabledBugs("");
  });

  it("guards null preferences and applies defaults", async () => {
    currentRows = [OK_USER, NULL_PREFS_USER];

    const digests = await runDigest();

    expect(digests).toEqual([
      { userId: "usr_ok", digestOptIn: true, locale: "en" },
      { userId: "usr_null_prefs", digestOptIn: false, locale: "en" },
    ]);
  });

  it("completes with exit code 0 and never captures", async () => {
    currentRows = [OK_USER, NULL_PREFS_USER];
    const captureException = mock(() => "event-id");
    const flush = mock(() => Promise.resolve(true));

    const exitCode = await runDigestJob({ captureException, flush });

    expect(exitCode).toBe(0);
    expect(captureException).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });
});

describe("runDigest (BC1 enabled)", () => {
  beforeEach(() => {
    setEnabledBugs("BC1");
  });

  it("throws a TypeError on the null-preferences user", async () => {
    currentRows = [OK_USER, NULL_PREFS_USER];

    await expect(runDigest()).rejects.toBeInstanceOf(TypeError);
  });

  it("captures the failure at fatal level, flushes, and exits 1", async () => {
    currentRows = [NULL_PREFS_USER];
    let capturedArgs: unknown[] = [];
    const captureException = mock((...args: unknown[]) => {
      capturedArgs = args;
      return "event-id";
    });
    const flush = mock(() => Promise.resolve(true));

    const exitCode = await runDigestJob({ captureException, flush });

    expect(exitCode).toBe(1);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(capturedArgs[0]).toBeInstanceOf(TypeError);
    expect(capturedArgs[1]).toEqual({ level: "fatal" });
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
