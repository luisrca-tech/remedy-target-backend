import { getClient, closeDb } from './client.ts';
import { users, orders, products } from './schema.ts';
import { eq } from 'drizzle-orm';

const TENANT_ID = 'remedy-target-test';

async function seed() {
  try {
    const db = getClient();

    // Delete all rows for the test tenant to ensure idempotency.
    await db.delete(users).where(eq(users.tenantId, TENANT_ID));
    await db.delete(orders).where(eq(orders.tenantId, TENANT_ID));
    await db.delete(products).where(eq(products.tenantId, TENANT_ID));

    // Seed users
    const userIds = ['usr_ok', 'usr_null_prefs', 'usr_null_zip'];
    await db.insert(users).values([
      {
        id: 'usr_ok',
        tenantId: TENANT_ID,
        email: 'ok@example.com',
        preferences: { digestOptIn: true, locale: 'en' },
        address: { street: '1 Main', zip: '90210' },
      },
      {
        id: 'usr_null_prefs',
        tenantId: TENANT_ID,
        email: 'nullprefs@example.com',
        preferences: null,
        address: { street: '2 Main', zip: '10001' },
      },
      {
        id: 'usr_null_zip',
        tenantId: TENANT_ID,
        email: 'nullzip@example.com',
        preferences: { digestOptIn: false, locale: 'fr' },
        address: { street: '3 Main', zip: null },
      },
    ]);

    // Seed orders
    const orderIds = ['ord_ok', 'ord_null_coupon'];
    await db.insert(orders).values([
      {
        id: 'ord_ok',
        tenantId: TENANT_ID,
        userId: 'usr_ok',
        coupon: { code: 'SAVE10', percentOff: 10 },
        total: 1000,
      },
      {
        id: 'ord_null_coupon',
        tenantId: TENANT_ID,
        userId: 'usr_ok',
        coupon: null,
        total: 500,
      },
    ]);

    // Seed products
    const productIds = ['prd_ok', 'prd_empty_cat'];
    await db.insert(products).values([
      {
        id: 'prd_ok',
        tenantId: TENANT_ID,
        name: 'Product OK',
        category: 'electronics',
      },
      {
        id: 'prd_empty_cat',
        tenantId: TENANT_ID,
        name: 'Product with Empty Category',
        category: '',
      },
    ]);

    console.log('✓ Seed completed successfully');
    console.log(`  - Users: ${userIds.join(', ')}`);
    console.log(`  - Orders: ${orderIds.join(', ')}`);
    console.log(`  - Products: ${productIds.join(', ')}`);
    console.log(`  - Tenant: ${TENANT_ID}`);
  } catch (err) {
    console.error('✗ Seed failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await closeDb();
  }
}

seed();
