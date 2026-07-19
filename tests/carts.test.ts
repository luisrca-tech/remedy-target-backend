import { describe, expect, it, mock } from "bun:test";

/**
 * Route tests for `GET /carts/:id/restore`. The `db` module is fully mocked so
 * no real Postgres connection is attempted. This route carries no seeded
 * defect; the `restored: null` branch for an expired cart is contract, not a
 * failure — it is the data the frontend FB2 defect dereferences.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FUTURE = new Date("2999-01-01T00:00:00.000Z");
const PAST = new Date(Date.now() - THIRTY_DAYS_MS);

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

describe("GET /carts/:id/restore", () => {
  it("restores an active cart with its items and total", async () => {
    currentRows = [
      {
        id: "cart_active",
        expiresAt: FUTURE,
        items: [
          { productId: "prd_ok", name: "Product OK", quantity: 2, unitPriceCents: 1500 },
          {
            productId: "prd_empty_cat",
            name: "Product with Empty Category",
            quantity: 1,
            unitPriceCents: 2500,
          },
        ],
        totalCents: 5500,
      },
    ];

    const app = createApp();
    const res = await app.request("/carts/cart_active/restore");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      restored: {
        id: "cart_active",
        expiresAt: FUTURE.toISOString(),
        items: [
          { productId: "prd_ok", name: "Product OK", quantity: 2, unitPriceCents: 1500 },
          {
            productId: "prd_empty_cat",
            name: "Product with Empty Category",
            quantity: 1,
            unitPriceCents: 2500,
          },
        ],
        totalCents: 5500,
      },
    });
  });

  it("returns restored: null with a 200 for an expired cart", async () => {
    currentRows = [
      {
        id: "cart_expired",
        expiresAt: PAST,
        items: [
          { productId: "prd_ok", name: "Product OK", quantity: 1, unitPriceCents: 1500 },
        ],
        totalCents: 1500,
      },
    ];

    const app = createApp();
    const res = await app.request("/carts/cart_expired/restore");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: null });
  });

  it("returns 404 for an unknown cart id", async () => {
    currentRows = [];

    const app = createApp();
    const res = await app.request("/carts/does-not-exist/restore");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Cart not found" });
  });

  it("sets CORS headers on a cross-origin GET from the allowed origin", async () => {
    currentRows = [{ id: "cart_expired", expiresAt: PAST, items: [], totalCents: 0 }];

    // Pin the allowed origin so the assertion never depends on the ambient
    // `.env` that Bun auto-loads.
    process.env.CORS_ORIGINS = "http://localhost:3000";
    const app = createApp();
    const res = await app.request("/carts/cart_expired/restore", {
      headers: { Origin: "http://localhost:3000" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });
});
