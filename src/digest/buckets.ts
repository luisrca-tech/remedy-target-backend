export type DigestOrder = {
  id: string;
  placedAt: Date;
  totalCents: number;
};

export type DayBucket = {
  day: string;
  orders: DigestOrder[];
};

/** Day buckets addressed by the day they cover. */
export type DayBuckets<Day extends string = string> = Record<Day, DayBucket>;

/**
 * The shopper-facing calendar day an instant falls on, in their zone. Keys and
 * lookups must both go through this so a day means the same thing on each side.
 */
export function localDayKey(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  }
}

export function bucketOrdersByDay(
  orders: readonly DigestOrder[],
  timeZone: string,
): DayBuckets {
  const buckets: DayBuckets = {};
  for (const order of orders) {
    const day = localDayKey(order.placedAt, timeZone);
    const bucket = buckets[day] ?? { day, orders: [] };
    bucket.orders.push(order);
    buckets[day] = bucket;
  }
  return buckets;
}

/**
 * Groups an order set into the day each order was placed on. The activity
 * digest reports the days a shopper actually ordered on, so the buckets are
 * built from the orders themselves rather than from a fixed window.
 */
export function bucketPlacedOrders(orders: readonly DigestOrder[]): DayBuckets {
  const buckets: DayBuckets = {};
  for (const order of orders) {
    const day = order.placedAt.toISOString().slice(0, 10);
    const bucket = buckets[day] ?? { day, orders: [] };
    bucket.orders.push(order);
    buckets[day] = bucket;
  }
  return buckets;
}

/**
 * The days a shopper placed orders on, in their zone, most recent first. This
 * is the running order of the activity digest.
 */
export function daysWithOrders(orders: readonly DigestOrder[], timeZone: string): string[] {
  const days = new Set<string>();
  for (const order of orders) {
    days.add(localDayKey(order.placedAt, timeZone));
  }
  return [...days].sort().reverse();
}

/**
 * The last `count` calendar days in the shopper's zone, most recent first. The
 * digest covers a fixed window, so days with no orders still get a section.
 */
export function recentDays(now: Date, timeZone: string, count: number): string[] {
  const days: string[] = [];
  for (let back = 0; back < count; back += 1) {
    const instant = new Date(now.getTime() - back * 24 * 60 * 60 * 1000);
    days.push(localDayKey(instant, timeZone));
  }
  return days;
}
