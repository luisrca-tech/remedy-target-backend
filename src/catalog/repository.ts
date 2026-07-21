import { and, asc, count, eq, ilike } from "drizzle-orm";

import { db } from "../db/client.ts";
import { products } from "../db/schema.ts";
import type { Product } from "../db/schema.ts";
import type { PageWindow } from "./query.ts";

export type ProductFilter = {
  tenantId: string;
  q: string;
  category: string;
};

function filterClause(filter: ProductFilter) {
  const clauses = [eq(products.tenantId, filter.tenantId)];
  if (filter.q) {
    clauses.push(ilike(products.name, `%${filter.q}%`));
  }
  if (filter.category) {
    clauses.push(eq(products.category, filter.category));
  }
  return and(...clauses);
}

export async function countProducts(filter: ProductFilter): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(products)
    .where(filterClause(filter));
  return rows[0]?.value ?? 0;
}

export async function listProducts(
  filter: ProductFilter,
  window: PageWindow,
): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(filterClause(filter))
    .orderBy(asc(products.name))
    .limit(window.limit)
    .offset(window.offset);
}

export async function findProduct(tenantId: string, id: string): Promise<Product | null> {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.id, id)));
  return rows[0] ?? null;
}
