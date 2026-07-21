import { describeError } from "../errors/describeError.ts";
import { closeDb, db } from "./client.ts";
import { CARTS, ORDERS, PRODUCTS, PROMOS, USERS } from "./fixtures.ts";
import { carts, orders, products, promos, users } from "./schema.ts";

/**
 * Inserts the fixture catalog, shoppers, carts and orders. Existing rows with
 * the same primary key are left alone, so re-running is harmless.
 */
export async function seed(): Promise<void> {
  await db.insert(users).values(USERS).onConflictDoNothing();
  await db.insert(products).values(PRODUCTS).onConflictDoNothing();
  await db.insert(promos).values(PROMOS).onConflictDoNothing();
  await db.insert(carts).values(CARTS).onConflictDoNothing();
  await db.insert(orders).values(ORDERS).onConflictDoNothing();

  console.log(
    `seed: ${USERS.length} shoppers, ${PRODUCTS.length} products, ${PROMOS.length} promos, ` +
      `${CARTS.length} carts, ${ORDERS.length} orders.`,
  );
}

if (import.meta.main) {
  try {
    await seed();
  } catch (err) {
    console.error(`seed: FAILED — ${describeError(err)}`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
