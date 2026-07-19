import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db/client.ts";
import { users } from "../db/schema.ts";

/**
 * Users route. `GET /users/:id` returns a single user for the browser client.
 *
 * NO seeded defect lives here: this route is a plain, honest read. It exists so
 * the sibling frontend consumes real API responses (including the seeded
 * `usr_null_address` row, whose `address` is null) instead of local fixtures.
 * The nullable `address` / `preferences` fields are passed through verbatim —
 * normalizing them away would erase the frontend's repro data.
 */
export const usersRoute = new Hono();

usersRoute.get("/:id", async (c) => {
  const id = c.req.param("id");

  const rows = await db.select().from(users).where(eq(users.id, id));
  const user = rows[0];

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    address: user.address ?? null,
    preferences: user.preferences ?? null,
  });
});
