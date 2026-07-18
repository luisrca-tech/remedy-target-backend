import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Route tests for `POST /signup`. The `db` module is fully mocked so no real
 * Postgres connection is attempted — the suite stays green without a database.
 *
 * BH2 dormant (the default `checks` window) is the correct contract: a missing
 * or malformed email yields a 400 `ValidationError` body, a valid payload yields
 * 201 with the created user. The BH2-on path (unguarded email normalize ->
 * TypeError -> onError -> 500) is asserted here too, driven purely by toggling
 * `ENABLED_BUGS` — no network or live DB involved.
 */

let insertedValues: Record<string, unknown> | undefined;

mock.module("../src/db/client.ts", () => ({
  db: {
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        insertedValues = vals;
        return {
          returning: () => Promise.resolve([{ ...vals }]),
        };
      },
    }),
  },
}));

const { createApp } = await import("../src/app.ts");

function postSignup(app: ReturnType<typeof createApp>, body: unknown) {
  return app.request("/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const savedEnabledBugs = process.env.ENABLED_BUGS;

afterEach(() => {
  insertedValues = undefined;
  if (savedEnabledBugs === undefined) {
    delete process.env.ENABLED_BUGS;
  } else {
    process.env.ENABLED_BUGS = savedEnabledBugs;
  }
});

describe("POST /signup (BH2 dormant)", () => {
  beforeEach(() => {
    process.env.ENABLED_BUGS = "";
  });

  it("returns 400 with a ValidationError body when email is missing", async () => {
    const app = createApp();
    const res = await postSignup(app, { name: "Ada" });

    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error: string; field?: string };
    expect(payload.error).toContain("email");
    expect(payload.field).toBe("email");
    expect(insertedValues).toBeUndefined();
  });

  it("returns 400 when email is present but malformed", async () => {
    const app = createApp();
    const res = await postSignup(app, { email: "not-an-email" });

    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error: string; field?: string };
    expect(payload.error).toContain("email");
    expect(insertedValues).toBeUndefined();
  });

  it("creates a user and returns 201 for a valid payload", async () => {
    const app = createApp();
    const res = await postSignup(app, { email: "  ada@example.com  ", name: "Ada" });

    expect(res.status).toBe(201);
    const payload = (await res.json()) as { id: string; email: string; tenantId: string };
    expect(payload.email).toBe("ada@example.com");
    expect(payload.id).toMatch(/^usr_/);
    expect(payload.tenantId).toBe("remedy-target-test");
    expect(insertedValues?.email).toBe("ada@example.com");
  });
});

describe("POST /signup (BH2 active)", () => {
  beforeEach(() => {
    process.env.ENABLED_BUGS = "BH2";
  });

  it("throws on a missing email and returns 500 instead of the 400 contract", async () => {
    const app = createApp();
    const res = await postSignup(app, { name: "Ada" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal Server Error" });
    expect(insertedValues).toBeUndefined();
  });
});
