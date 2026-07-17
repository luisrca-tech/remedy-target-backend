import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { isBugEnabled } from "../config/enabledBugs.ts";
import { db } from "../db/client.ts";
import { orders } from "../db/schema.ts";

/**
 * Orders route. `GET /orders/:id` loads an order by id and returns it with a
 * discounted total computed from the order's coupon.
 *
 * Seeded defect BH1 (dormant unless `ENABLED_BUGS` includes "BH1"): the discount
 * branch dereferences `order.coupon.percentOff` directly. The `coupon` column is
 * nullable, so for the seeded `ord_null_coupon` row (coupon = null) this throws a
 * `TypeError` at runtime. The error propagates to the app-level `onError`
 * handler, which captures it to Sentry (a real incident carrying the
 * `http.method` tag) and returns a 500. With BH1 off — the default during
 * checks — the coupon is guarded safely and the request returns 200.
 */
export const ordersRoute = new Hono();

ordersRoute.get("/:id", async (c) => {
  const id = c.req.param("id");

  const rows = await db.select().from(orders).where(eq(orders.id, id));
  const order = rows[0];

  if (!order) {
    return c.json({ error: "Order not found" }, 404);
  }

  let percentOff: number;
  if (isBugEnabled("BH1")) {
    // BH1 (seeded defect): unguarded coupon dereference. `order.coupon` is
    // nullable, so this throws a `TypeError` at runtime for `ord_null_coupon`.
    // @ts-expect-error BH1: order.coupon may be null; the unguarded deref is the seeded defect.
    percentOff = order.coupon.percentOff;
  } else {
    percentOff = order.coupon?.percentOff ?? 0;
  }

  const discount = Math.round((order.total * percentOff) / 100);
  const discountedTotal = order.total - discount;

  return c.json({
    id: order.id,
    total: order.total,
    discount,
    discountedTotal,
  });
});
