import { describe, expect, it, mock } from "bun:test";

/**
 * Route tests for `GET /users/:id`. The `db` module is fully mocked so no real
 * Postgres connection is attempted — the suite must stay green without a
 * database. This route carries no seeded defect.
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

describe("GET /users/:id", () => {
  it("returns the full user shape", async () => {
    currentRows = [
      {
        id: "usr_ok",
        email: "ok@example.com",
        address: { street: "1 Main", zip: "90210" },
        preferences: { digestOptIn: true, locale: "en" },
      },
    ];

    const app = createApp();
    const res = await app.request("/users/usr_ok");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "usr_ok",
      email: "ok@example.com",
      address: { street: "1 Main", zip: "90210" },
      preferences: { digestOptIn: true, locale: "en" },
    });
  });

  it("passes a null address through verbatim (backs the frontend FB1 repro)", async () => {
    currentRows = [
      {
        id: "usr_null_address",
        email: "nulladdress@example.com",
        address: null,
        preferences: { digestOptIn: true, locale: "en" },
      },
    ];

    const app = createApp();
    const res = await app.request("/users/usr_null_address");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "usr_null_address",
      email: "nulladdress@example.com",
      address: null,
      preferences: { digestOptIn: true, locale: "en" },
    });
  });

  it("returns 404 when the user is not found", async () => {
    currentRows = [];

    const app = createApp();
    const res = await app.request("/users/does-not-exist");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
  });

  it("sets CORS headers on a cross-origin GET from the allowed origin", async () => {
    currentRows = [
      { id: "usr_ok", email: "ok@example.com", address: null, preferences: null },
    ];

    // Pin the allowed origin so the assertion never depends on the ambient
    // `.env` that Bun auto-loads.
    process.env.CORS_ORIGINS = "http://localhost:3000";
    const app = createApp();
    const res = await app.request("/users/usr_ok", {
      headers: { Origin: "http://localhost:3000" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });
});
