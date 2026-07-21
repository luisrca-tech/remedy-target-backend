import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db/client.ts";
import { carts, products, promos } from "../db/schema.ts";
import type { Cart, CartLine, Product, Promo } from "../db/schema.ts";

export async function findCart(tenantId: string, id: string): Promise<Cart | null> {
  const rows = await db
    .select()
    .from(carts)
    .where(and(eq(carts.tenantId, tenantId), eq(carts.id, id)));
  return rows[0] ?? null;
}

export async function findProductsByIds(
  tenantId: string,
  ids: readonly string[],
): Promise<Product[]> {
  if (ids.length === 0) {
    return [];
  }
  return db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, [...ids])));
}

export async function findPromo(tenantId: string, code: string): Promise<Promo | null> {
  const rows = await db
    .select()
    .from(promos)
    .where(and(eq(promos.tenantId, tenantId), eq(promos.code, code)));
  return rows[0] ?? null;
}

export async function saveCartLines(id: string, lines: CartLine[]): Promise<void> {
  await db.update(carts).set({ lines }).where(eq(carts.id, id));
}

export async function saveCartPromo(id: string, promoCode: string | null): Promise<void> {
  await db.update(carts).set({ promoCode }).where(eq(carts.id, id));
}
