import { jsonb, pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';

/**
 * Users table: stores user records with optional preferences and address info.
 * Text primary key using human-readable seed ids.
 * tenantId partitions data by tenant.
 * preferences and address are jsonb and nullable (load-bearing for seed bugs).
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  email: text('email').notNull(),
  preferences: jsonb('preferences').$type<{ digestOptIn: boolean; locale: string }>(),
  address: jsonb('address').$type<{ street: string; zip: string | null }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Orders table: stores orders linked to users.
 * coupon is jsonb and nullable (load-bearing for seed bugs).
 */
export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  coupon: jsonb('coupon').$type<{ code: string; percentOff: number }>(),
  total: integer('total').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Products table: stores product records.
 * category is text not null but one seed row has empty string "" (load-bearing).
 */
export const products = pgTable('products', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Cart item shape stored inside `carts.items`.
 */
export type CartItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
};

/**
 * Carts table: stores per-user carts consumed by the browser (`GET /carts/:id/restore`).
 * expiresAt is load-bearing: a cart whose expiry is in the past restores as null.
 */
export const carts = pgTable('carts', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  items: jsonb('items').$type<CartItem[]>(),
  totalCents: integer('total_cents').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Inferred types for runtime use.
 */
export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type OrderInsert = typeof orders.$inferInsert;
export type Product = typeof products.$inferSelect;
export type ProductInsert = typeof products.$inferInsert;
export type Cart = typeof carts.$inferSelect;
export type CartInsert = typeof carts.$inferInsert;
