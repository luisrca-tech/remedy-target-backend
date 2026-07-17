import { describe, expect, it, mock } from "bun:test";

/**
 * Route tests for `GET /orders/:id` with BH1 dormant (the default `checks`
 * window). The `db` module is fully mocked so no real Postgres connection is
 * attempted — the suite must stay green without a database. The BH1-on path
 * (unguarded coupon deref -> 500 + Sentry event) is exercised in a live window,
 * not here.
 */

let currentRows: Array<Record<string, unknown>> = [];

mock.module("../src/db/client.ts", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(currentRows),
      }),
    }),
  },
}));

const { createApp } = await import("../src/app.ts");

describe("GET /orders/:id (BH1 dormant)", () => {
  it("guards a null coupon and returns a zero discount", async () => {
    currentRows = [{ id: "ord_null_coupon", coupon: null, total: 500 }];

    const app = createApp();
    const res = await app.request("/orders/ord_null_coupon");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "ord_null_coupon",
      total: 500,
      discount: 0,
      discountedTotal: 500,
    });
  });

  it("applies the coupon discount for a coupon-bearing order", async () => {
    currentRows = [{ id: "ord_ok", coupon: { code: "SAVE10", percentOff: 10 }, total: 1000 }];

    const app = createApp();
    const res = await app.request("/orders/ord_ok");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "ord_ok",
      total: 1000,
      discount: 100,
      discountedTotal: 900,
    });
  });

  it("returns 404 when the order is not found", async () => {
    currentRows = [];

    const app = createApp();
    const res = await app.request("/orders/does-not-exist");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Order not found" });
  });
});
