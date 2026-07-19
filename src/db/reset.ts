import { getClient, closeDb } from './client.ts';
import { users, orders, products, carts } from './schema.ts';
import { eq } from 'drizzle-orm';

const TENANT_ID = 'remedy-target-test';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function reset() {
  try {
    const db = getClient();

    // Delete all rows for the test tenant
    await db.delete(users).where(eq(users.tenantId, TENANT_ID));
    await db.delete(orders).where(eq(orders.tenantId, TENANT_ID));
    await db.delete(products).where(eq(products.tenantId, TENANT_ID));
    await db.delete(carts).where(eq(carts.tenantId, TENANT_ID));

    // Re-seed the fixture state
    const userIds = ['usr_ok', 'usr_null_prefs', 'usr_null_zip', 'usr_null_address'];
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
      {
        // Load-bearing: address is null. Backs the frontend FB1 defect, which
        // dereferences `user.address.street` on the real API response.
        id: 'usr_null_address',
        tenantId: TENANT_ID,
        email: 'nulladdress@example.com',
        preferences: { digestOptIn: true, locale: 'en' },
        address: null,
      },
    ]);

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

    const cartIds = ['cart_active', 'cart_expired'];
    await db.insert(carts).values([
      {
        id: 'cart_active',
        tenantId: TENANT_ID,
        userId: 'usr_ok',
        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
        items: [
          { productId: 'prd_ok', name: 'Product OK', quantity: 2, unitPriceCents: 1500 },
          { productId: 'prd_empty_cat', name: 'Product with Empty Category', quantity: 1, unitPriceCents: 2500 },
        ],
        totalCents: 5500,
      },
      {
        // Load-bearing: expiry in the past, so `GET /carts/:id/restore` returns
        // `{ restored: null }`. Backs the frontend FB2 defect, which
        // dereferences that null.
        id: 'cart_expired',
        tenantId: TENANT_ID,
        userId: 'usr_ok',
        expiresAt: new Date(Date.now() - THIRTY_DAYS_MS),
        items: [
          { productId: 'prd_ok', name: 'Product OK', quantity: 1, unitPriceCents: 1500 },
        ],
        totalCents: 1500,
      },
    ]);

    console.log('✓ Reset completed successfully');
    console.log(`  - Users: ${userIds.join(', ')}`);
    console.log(`  - Orders: ${orderIds.join(', ')}`);
    console.log(`  - Products: ${productIds.join(', ')}`);
    console.log(`  - Carts: ${cartIds.join(', ')}`);
    console.log(`  - Tenant: ${TENANT_ID}`);
  } catch (err) {
    console.error('✗ Reset failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await closeDb();
  }
}

reset();
