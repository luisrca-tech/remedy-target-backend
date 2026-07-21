import { describe, expect, it } from "bun:test";

import {
  bucketOrdersByDay,
  bucketPlacedOrders,
  daysWithOrders,
  localDayKey,
  recentDays,
} from "../src/digest/buckets.ts";

const order = (id: string, placedAt: string) => ({
  id,
  placedAt: new Date(placedAt),
  totalCents: 1000,
});

describe("localDayKey", () => {
  it("formats an ISO day in the given zone", () => {
    expect(localDayKey(new Date("2026-03-10T15:00:00Z"), "UTC")).toBe("2026-03-10");
  });

  it("rolls back to the previous day west of UTC", () => {
    expect(localDayKey(new Date("2026-03-10T02:15:00Z"), "America/Sao_Paulo")).toBe("2026-03-09");
  });

  it("rolls forward to the next day east of UTC", () => {
    expect(localDayKey(new Date("2026-03-10T22:30:00Z"), "Asia/Tokyo")).toBe("2026-03-11");
  });

  it("falls back to UTC when the zone is not usable", () => {
    expect(localDayKey(new Date("2026-03-10T15:00:00Z"), "Not/AZone")).toBe("2026-03-10");
  });
});

describe("bucketOrdersByDay", () => {
  it("groups orders under their local day", () => {
    const buckets = bucketOrdersByDay(
      [order("ord_1", "2026-03-10T15:00:00Z"), order("ord_2", "2026-03-10T16:00:00Z")],
      "UTC",
    );

    expect(Object.keys(buckets)).toEqual(["2026-03-10"]);
    expect(buckets["2026-03-10"]?.orders).toHaveLength(2);
  });

  it("keys a boundary-crossing order by the shopper's local day", () => {
    const buckets = bucketOrdersByDay(
      [order("ord_boundary", "2026-03-10T02:15:00Z")],
      "America/Sao_Paulo",
    );

    expect(buckets["2026-03-09"]?.orders.map((o) => o.id)).toEqual(["ord_boundary"]);
    expect(buckets["2026-03-10"]).toBeUndefined();
  });

  it("is keyed by exactly the same function used to look a day up", () => {
    const placed = new Date("2026-03-10T02:15:00Z");
    const buckets = bucketOrdersByDay([order("ord_boundary", placed.toISOString())], "America/Sao_Paulo");

    expect(buckets[localDayKey(placed, "America/Sao_Paulo")]).toBeDefined();
  });

  it("returns no buckets for a shopper with no orders", () => {
    expect(bucketOrdersByDay([], "UTC")).toEqual({});
  });
});

describe("bucketPlacedOrders", () => {
  it("collects the orders placed on the same day into one bucket", () => {
    const buckets = bucketPlacedOrders([
      order("ord_1", "2026-03-10T15:00:00Z"),
      order("ord_2", "2026-03-10T16:00:00Z"),
    ]);

    expect(Object.keys(buckets)).toHaveLength(1);
    expect(Object.values(buckets)[0]?.orders.map((o) => o.id)).toEqual(["ord_1", "ord_2"]);
  });

  it("keeps separate days apart", () => {
    const buckets = bucketPlacedOrders([
      order("ord_1", "2026-03-10T15:00:00Z"),
      order("ord_2", "2026-03-08T16:00:00Z"),
    ]);

    expect(Object.keys(buckets)).toHaveLength(2);
  });

  it("returns no buckets for a shopper with no orders", () => {
    expect(bucketPlacedOrders([])).toEqual({});
  });
});

describe("daysWithOrders", () => {
  it("lists the days a shopper ordered on, most recent first", () => {
    const days = daysWithOrders(
      [
        order("ord_1", "2026-03-08T15:00:00Z"),
        order("ord_2", "2026-03-10T09:00:00Z"),
        order("ord_3", "2026-03-10T16:00:00Z"),
      ],
      "UTC",
    );

    expect(days).toEqual(["2026-03-10", "2026-03-08"]);
  });

  it("labels a day in the shopper's zone", () => {
    expect(daysWithOrders([order("ord_1", "2026-03-10T02:15:00Z")], "America/Sao_Paulo")).toEqual([
      "2026-03-09",
    ]);
    expect(daysWithOrders([order("ord_1", "2026-03-10T22:30:00Z")], "Asia/Tokyo")).toEqual([
      "2026-03-11",
    ]);
  });

  it("is empty for a shopper with no orders", () => {
    expect(daysWithOrders([], "UTC")).toEqual([]);
  });
});

describe("recentDays", () => {
  it("lists the window most recent first", () => {
    const days = recentDays(new Date("2026-03-10T12:00:00Z"), "UTC", 3);
    expect(days).toEqual(["2026-03-10", "2026-03-09", "2026-03-08"]);
  });

  it("uses the shopper's zone for the boundary", () => {
    const days = recentDays(new Date("2026-03-10T02:15:00Z"), "America/Sao_Paulo", 2);
    expect(days).toEqual(["2026-03-09", "2026-03-08"]);
  });
});
