import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db/client.ts";
import { carts } from "../db/schema.ts";

/**
 * Carts route. `GET /carts/:id/restore` returns `{ restored: Cart | null }`.
 *
 * CONTRACT: an expired cart is NOT an error — it restores as `null` with a 200.
 * Only an unknown cart id is a 404. The sibling frontend relies on this exact
 * shape; the null branch is legitimate API behaviour, not a failure mode.
 *
 * NO seeded defect lives here: this route is a plain, honest read.
 */
export const cartsRoute = new Hono();

cartsRoute.get("/:id/restore", async (c) => {
  const id = c.req.param("id");

  const rows = await db.select().from(carts).where(eq(carts.id, id));
  const cart = rows[0];

  if (!cart) {
    return c.json({ error: "Cart not found" }, 404);
  }

  const expiresAt = new Date(cart.expiresAt);
  if (expiresAt.getTime() <= Date.now()) {
    return c.json({ restored: null });
  }

  return c.json({
    restored: {
      id: cart.id,
      expiresAt: expiresAt.toISOString(),
      items: cart.items ?? [],
      totalCents: cart.totalCents,
    },
  });
});
