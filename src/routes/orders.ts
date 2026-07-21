import { Hono } from "hono";

import { isRolloutEnabled } from "../config/rollout.ts";
import { DEFAULT_TENANT_ID } from "../config/tenant.ts";
import { toOrderReceipt, toOrderSummary } from "../orders/present.ts";
import { findOrder, listOrders } from "../orders/repository.ts";

export const ordersRoute = new Hono();

/** Every status an order can hold; the vocabulary `?status=` accepts. */
const SUPPORTED_STATUSES = ["placed", "delivered", "cancelled"] as const;

function parseDate(raw: string | undefined): Date | null {
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSupportedStatus(status: string): boolean {
  return (SUPPORTED_STATUSES as readonly string[]).includes(status);
}

ordersRoute.get("/", async (c) => {
  const query = c.req.query();
  const userId = (query.userId ?? "").trim();

  if (!userId) {
    return c.json({ error: "userId is required", field: "userId" }, 400);
  }

  const filterRolledOut = isRolloutEnabled("orders-status-filter");
  const rawStatus = (query.status ?? "").trim();
  // Case folding belongs to the same rollout as the vocabulary check: until the
  // filter ships, the value reaches the query exactly as the caller sent it.
  const status = filterRolledOut ? rawStatus.toLowerCase() : rawStatus;

  // A status outside the vocabulary is a typo on the caller's side, so name it.
  // An empty result would read as "this shopper has no such orders", which is a
  // different and misleading answer.
  if (filterRolledOut && status !== "" && !isSupportedStatus(status)) {
    return c.json(
      { error: `status must be one of: ${SUPPORTED_STATUSES.join(", ")}`, field: "status" },
      400,
    );
  }

  const rows = await listOrders({
    tenantId: DEFAULT_TENANT_ID,
    userId,
    from: parseDate(query.from),
    to: parseDate(query.to),
    status,
  });

  return c.json({ items: rows.map(toOrderSummary) });
});

ordersRoute.get("/:id", async (c) => {
  const order = await findOrder(DEFAULT_TENANT_ID, c.req.param("id"));

  if (!order) {
    return c.json({ error: "Order not found" }, 404);
  }

  return c.json(toOrderReceipt(order));
});
