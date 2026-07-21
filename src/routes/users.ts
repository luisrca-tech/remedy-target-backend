import { Hono } from "hono";
import { z } from "zod";

import { findUser, savePreferences } from "../account/repository.ts";
import { DEFAULT_TENANT_ID } from "../config/tenant.ts";
import { ValidationError } from "../errors/ValidationError.ts";
import type { UserPreferences } from "../db/schema.ts";

export const usersRoute = new Hono();

const preferencesSchema = z.object({
  digestOptIn: z.boolean({ error: "digestOptIn must be a boolean" }),
  locale: z.string().trim().nullable(),
  currency: z.string({ error: "currency is required" }).trim().min(3, "currency must be a 3-letter code"),
  timeZone: z.string({ error: "timeZone is required" }).trim().min(1, "timeZone is required"),
});

usersRoute.get("/:id", async (c) => {
  const user = await findUser(DEFAULT_TENANT_ID, c.req.param("id"));

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    address: user.address ?? null,
    preferences: user.preferences ?? null,
  });
});

usersRoute.patch("/:id/preferences", async (c) => {
  const user = await findUser(DEFAULT_TENANT_ID, c.req.param("id"));

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    const result = preferencesSchema.safeParse(body);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new ValidationError(issue?.message ?? "Invalid preferences", issue?.path.join("."));
    }

    const preferences: UserPreferences = {
      digestOptIn: result.data.digestOptIn,
      locale: result.data.locale,
      currency: result.data.currency.toUpperCase(),
      timeZone: result.data.timeZone,
    };

    await savePreferences(user.id, preferences);
    return c.json({ id: user.id, preferences });
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message, field: err.field }, 400);
    }
    throw err;
  }
});
