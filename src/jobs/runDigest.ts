import { execSync } from "node:child_process";

import * as Sentry from "@sentry/node";

import { listUsers } from "../account/repository.ts";
import { env } from "../config/env.ts";
import { isRolloutEnabled } from "../config/rollout.ts";
import { DEFAULT_TENANT_ID } from "../config/tenant.ts";
import {
  bucketOrdersByDay,
  bucketPlacedOrders,
  daysWithOrders,
  recentDays,
} from "../digest/buckets.ts";
import { listOrders } from "../orders/repository.ts";
import type { DayBuckets, DigestOrder } from "../digest/buckets.ts";
import type { Order, User } from "../db/schema.ts";

/**
 * Daily digest job. Summarizes each opted-in shopper's recent orders, grouped
 * into the calendar days of their own time zone.
 *
 * Sentry is initialized separately from the service here because this runs as a
 * CLI process rather than inside the server. Like the service, it is a no-op
 * without `SENTRY_DSN` so tests and local runs never reach the network.
 */

const DIGEST_WINDOW_DAYS = 7;
const DEFAULT_TIME_ZONE = "UTC";

export type DigestSection = {
  day: string;
  orderCount: number;
  totalCents: number;
};

export type UserDigest = {
  userId: string;
  timeZone: string;
  sections: DigestSection[];
  totalCents: number;
};

export interface JobSentry {
  captureException(exception: unknown, hint?: unknown): unknown;
  flush(timeout?: number): Promise<boolean>;
}

function toDigestOrders(orders: readonly Order[]): DigestOrder[] {
  return orders.map((order) => ({
    id: order.id,
    placedAt: order.placedAt,
    totalCents: order.totalCents,
  }));
}

function digestTotal(sections: readonly DigestSection[]): number {
  return sections.reduce((sum, section) => sum + section.totalCents, 0);
}

/**
 * Summarizes each of `days` from the buckets it shares a day key with.
 */
function summarizeDays<Day extends string>(
  buckets: DayBuckets<Day>,
  days: readonly Day[],
): DigestSection[] {
  return days.map((day) => {
    const dayOrders = buckets[day].orders;
    return {
      day,
      orderCount: dayOrders.length,
      totalCents: dayOrders.reduce((sum, order) => sum + order.totalCents, 0),
    };
  });
}

export function buildUserDigest(user: User, orders: readonly Order[], now: Date): UserDigest {
  const timeZone = user.preferences?.timeZone ?? DEFAULT_TIME_ZONE;
  const digestOrders = toDigestOrders(orders);

  if (isRolloutEnabled("digest-timezone-buckets")) {
    const sections = summarizeDays(
      bucketPlacedOrders(digestOrders),
      daysWithOrders(digestOrders, timeZone),
    );

    return { userId: user.id, timeZone, sections, totalCents: digestTotal(sections) };
  }

  const buckets = bucketOrdersByDay(digestOrders, timeZone);

  const sections = recentDays(now, timeZone, DIGEST_WINDOW_DAYS).map((day) => {
    const bucket = buckets[day];
    const dayOrders = bucket?.orders ?? [];
    return {
      day,
      orderCount: dayOrders.length,
      totalCents: dayOrders.reduce((sum, order) => sum + order.totalCents, 0),
    };
  });

  return {
    userId: user.id,
    timeZone,
    sections,
    totalCents: digestTotal(sections),
  };
}

export async function runDigest(now: Date = new Date()): Promise<UserDigest[]> {
  const users = await listUsers(DEFAULT_TENANT_ID);
  const optedIn = users.filter((user) => user.preferences?.digestOptIn === true);

  const digests: UserDigest[] = [];
  for (const user of optedIn) {
    const orders = await listOrders({
      tenantId: DEFAULT_TENANT_ID,
      userId: user.id,
      from: new Date(now.getTime() - DIGEST_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      to: now,
      status: "",
    });
    digests.push(buildUserDigest(user, orders, now));
  }
  return digests;
}

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

export function initDigestSentry(): void {
  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  const release = resolveRelease();
  if (!release) {
    throw new Error(
      "runDigest: SENTRY_DSN is set but no git SHA is available for the release. " +
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

export async function runDigestJob(sentry: JobSentry): Promise<number> {
  try {
    const digests = await runDigest();
    console.log(`runDigest: built digests for ${digests.length} shopper(s).`);
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
