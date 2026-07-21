import { eq } from "drizzle-orm";

import { DEFAULT_TENANT_ID } from "../config/tenant.ts";
import { describeError } from "../errors/describeError.ts";
import { closeDb, db } from "./client.ts";
import { seed } from "./seed.ts";
import { carts, orders, products, promos, users } from "./schema.ts";

/**
 * Clears the tenant's rows and seeds them again, so a run starts from a known
 * state. Scoped by tenant rather than truncating, so it is safe to point at a
 * shared database.
 */
export async function reset(): Promise<void> {
  await db.delete(orders).where(eq(orders.tenantId, DEFAULT_TENANT_ID));
  await db.delete(carts).where(eq(carts.tenantId, DEFAULT_TENANT_ID));
  await db.delete(promos).where(eq(promos.tenantId, DEFAULT_TENANT_ID));
  await db.delete(products).where(eq(products.tenantId, DEFAULT_TENANT_ID));
  await db.delete(users).where(eq(users.tenantId, DEFAULT_TENANT_ID));

  console.log(`reset: cleared tenant ${DEFAULT_TENANT_ID}.`);
  await seed();
}

if (import.meta.main) {
  try {
    await reset();
  } catch (err) {
    console.error(`reset: FAILED — ${describeError(err)}`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
