import { and, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "../db/client.ts";
import { orders } from "../db/schema.ts";
import type { Order, OrderInsert } from "../db/schema.ts";

export type OrderFilter = {
  tenantId: string;
  userId: string;
  from: Date | null;
  to: Date | null;
  status: string;
};

export async function listOrders(filter: OrderFilter): Promise<Order[]> {
  const clauses = [eq(orders.tenantId, filter.tenantId), eq(orders.userId, filter.userId)];
  if (filter.from) {
    clauses.push(gte(orders.placedAt, filter.from));
  }
  if (filter.to) {
    clauses.push(lte(orders.placedAt, filter.to));
  }
  if (filter.status) {
    clauses.push(eq(orders.status, filter.status));
  }

  return db
    .select()
    .from(orders)
    .where(and(...clauses))
    .orderBy(desc(orders.placedAt));
}

export async function findOrder(tenantId: string, id: string): Promise<Order | null> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)));
  return rows[0] ?? null;
}

export async function createOrder(values: OrderInsert): Promise<Order> {
  const rows = await db.insert(orders).values(values).returning();
  const created = rows[0];
  if (!created) {
    throw new Error(`Failed to create order ${values.id}: insert returned no rows`);
  }
  return created;
}
