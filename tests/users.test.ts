import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { Address, User, UserPreferences } from "../src/db/schema.ts";
import { jsonBody } from "./helpers.ts";

type ProfileBody = {
  id: string;
  email: string;
  name: string | null;
  address: Address | null;
  preferences: UserPreferences | null;
};

const user = (over: Partial<User> = {}): User =>
  ({
    id: "usr_1",
    tenantId: "sundry",
    email: "shopper@example.com",
    name: "Shopper",
    address: { street: "12 Rua das Flores", city: "Porto", postalCode: "4000-007", country: "PT" },
    preferences: { digestOptIn: true, locale: "pt-PT", currency: "EUR", timeZone: "Europe/Lisbon" },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  }) as User;

let found: User | null = null;
let saved: UserPreferences | null = null;

mock.module("../src/account/repository.ts", () => ({
  findUser: () => Promise.resolve(found),
  savePreferences: (_id: string, preferences: UserPreferences) => {
    saved = preferences;
    return Promise.resolve();
  },
  listUsers: () => Promise.resolve([]),
  createUser: () => Promise.reject(new Error("not used here")),
}));

const { createApp } = await import("../src/app.ts");

const patch = (body: unknown) =>
  createApp().request("/users/usr_1/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  found = user();
  saved = null;
});

describe("GET /users/:id", () => {
  it("returns the profile", async () => {
    const body = await jsonBody<ProfileBody>(await createApp().request("/users/usr_1"));

    expect(body.id).toBe("usr_1");
    expect(body.preferences).toEqual({
      digestOptIn: true,
      locale: "pt-PT",
      currency: "EUR",
      timeZone: "Europe/Lisbon",
    });
  });

  it("passes a null address through rather than inventing one", async () => {
    found = user({ address: null });

    const body = await jsonBody<ProfileBody>(await createApp().request("/users/usr_1"));
    expect(body.address).toBeNull();
  });

  it("passes null preferences through", async () => {
    found = user({ preferences: null });

    const body = await jsonBody<ProfileBody>(await createApp().request("/users/usr_1"));
    expect(body.preferences).toBeNull();
  });

  it("returns 404 for an unknown user", async () => {
    found = null;

    const res = await createApp().request("/users/nope");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /users/:id/preferences", () => {
  const valid = {
    digestOptIn: false,
    locale: "en-GB",
    currency: "gbp",
    timeZone: "Europe/London",
  };

  it("stores the preferences and upper-cases the currency", async () => {
    const res = await patch(valid);

    expect(res.status).toBe(200);
    expect(saved).toEqual({
      digestOptIn: false,
      locale: "en-GB",
      currency: "GBP",
      timeZone: "Europe/London",
    });
  });

  it("accepts an explicitly null locale", async () => {
    const res = await patch({ ...valid, locale: null });

    expect(res.status).toBe(200);
    expect(saved?.locale).toBeNull();
  });

  it("rejects a missing timeZone with 400", async () => {
    const res = await patch({ digestOptIn: true, locale: "en", currency: "GBP" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "timeZone" });
    expect(saved).toBeNull();
  });

  it("rejects a non-boolean digestOptIn with 400", async () => {
    const res = await patch({ ...valid, digestOptIn: "yes" });

    expect(res.status).toBe(400);
    expect(saved).toBeNull();
  });

  it("returns 404 when the user does not exist", async () => {
    found = null;

    const res = await patch(valid);
    expect(res.status).toBe(404);
  });
});
