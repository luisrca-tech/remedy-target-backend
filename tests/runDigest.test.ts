import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { buildUserDigest, runDigestJob } from "../src/jobs/runDigest.ts";
import type { JobSentry } from "../src/jobs/runDigest.ts";
import type { Order, User } from "../src/db/schema.ts";

const NOW = new Date("2026-03-10T12:00:00Z");

const user = (timeZone: string, over: Partial<User> = {}): User =>
  ({
    id: "usr_1",
    tenantId: "sundry",
    email: "shopper@example.com",
    name: "Shopper",
    address: null,
    preferences: { digestOptIn: true, locale: "en-GB", currency: "GBP", timeZone },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  }) as User;

const order = (id: string, placedAt: string, totalCents = 1000): Order =>
  ({
    id,
    tenantId: "sundry",
    userId: "usr_1",
    status: "placed",
    lines: [],
    coupon: null,
    subtotalCents: totalCents,
    discountCents: 0,
    totalCents,
    placedAt: new Date(placedAt),
    createdAt: new Date(placedAt),
  }) as Order;

describe("buildUserDigest", () => {
  it("covers a fixed window of days, including empty ones", () => {
    const digest = buildUserDigest(user("UTC"), [], NOW);

    expect(digest.sections).toHaveLength(7);
    expect(digest.sections[0]).toEqual({ day: "2026-03-10", orderCount: 0, totalCents: 0 });
    expect(digest.totalCents).toBe(0);
  });

  it("totals the orders that fall on a day", () => {
    const digest = buildUserDigest(
      user("UTC"),
      [order("ord_1", "2026-03-10T09:00:00Z", 1500), order("ord_2", "2026-03-10T11:00:00Z", 500)],
      NOW,
    );

    expect(digest.sections[0]).toEqual({ day: "2026-03-10", orderCount: 2, totalCents: 2000 });
    expect(digest.totalCents).toBe(2000);
  });

  it("files a boundary-crossing order under the shopper's local day", () => {
    const digest = buildUserDigest(
      user("America/Sao_Paulo"),
      [order("ord_boundary", "2026-03-10T02:15:00Z", 4200)],
      NOW,
    );

    const byDay = Object.fromEntries(digest.sections.map((s) => [s.day, s]));
    expect(byDay["2026-03-09"]).toMatchObject({ orderCount: 1, totalCents: 4200 });
    expect(byDay["2026-03-10"]).toMatchObject({ orderCount: 0 });
    expect(digest.totalCents).toBe(4200);
  });

  it("falls back to UTC when the shopper has no preferences", () => {
    const digest = buildUserDigest(user("UTC", { preferences: null }), [], NOW);
    expect(digest.timeZone).toBe("UTC");
  });
});

const ambientFlags = process.env.ROLLOUT_FLAGS;

function setFlags(raw: string | undefined): void {
  if (raw === undefined) {
    delete process.env.ROLLOUT_FLAGS;
  } else {
    process.env.ROLLOUT_FLAGS = raw;
  }
}

describe("buildUserDigest once the activity digest is rolled out", () => {
  beforeEach(() => {
    setFlags("digest-timezone-buckets");
  });

  afterEach(() => {
    setFlags(ambientFlags);
  });

  it("reports only the days the shopper ordered on, most recent first", () => {
    const digest = buildUserDigest(
      user("UTC"),
      [order("ord_1", "2026-03-08T09:00:00Z", 1500), order("ord_2", "2026-03-10T11:00:00Z", 500)],
      NOW,
    );

    expect(digest.sections).toEqual([
      { day: "2026-03-10", orderCount: 1, totalCents: 500 },
      { day: "2026-03-08", orderCount: 1, totalCents: 1500 },
    ]);
    expect(digest.totalCents).toBe(2000);
  });

  it("totals the orders that share a day", () => {
    const digest = buildUserDigest(
      user("UTC"),
      [order("ord_1", "2026-03-10T09:00:00Z", 1500), order("ord_2", "2026-03-10T11:00:00Z", 500)],
      NOW,
    );

    expect(digest.sections).toEqual([{ day: "2026-03-10", orderCount: 2, totalCents: 2000 }]);
    expect(digest.totalCents).toBe(2000);
  });

  it("labels the day in the shopper's zone", () => {
    const digest = buildUserDigest(
      user("America/Sao_Paulo"),
      [order("ord_1", "2026-03-10T12:30:00Z", 4200)],
      NOW,
    );

    expect(digest.timeZone).toBe("America/Sao_Paulo");
    expect(digest.sections).toEqual([{ day: "2026-03-10", orderCount: 1, totalCents: 4200 }]);
  });

  it("reports nothing for a shopper with no orders", () => {
    const digest = buildUserDigest(user("UTC"), [], NOW);

    expect(digest.sections).toEqual([]);
    expect(digest.totalCents).toBe(0);
  });
});

describe("runDigestJob", () => {
  it("exits 0 when the digest completes", async () => {
    mock.module("../src/account/repository.ts", () => ({ listUsers: () => Promise.resolve([]) }));
    mock.module("../src/orders/repository.ts", () => ({ listOrders: () => Promise.resolve([]) }));

    const sentry: JobSentry = {
      captureException: () => undefined,
      flush: () => Promise.resolve(true),
    };

    expect(await runDigestJob(sentry)).toBe(0);
  });

  it("captures at fatal and exits non-zero when the digest throws", async () => {
    mock.module("../src/account/repository.ts", () => ({
      listUsers: () => Promise.reject(new Error("database is down")),
    }));

    const captured: unknown[] = [];
    let flushed = false;
    const sentry: JobSentry = {
      captureException: (err, hint) => {
        captured.push({ err, hint });
        return undefined;
      },
      flush: () => {
        flushed = true;
        return Promise.resolve(true);
      },
    };

    expect(await runDigestJob(sentry)).toBe(1);
    expect(captured).toHaveLength(1);
    expect(flushed).toBe(true);
  });
});
