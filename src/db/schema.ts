import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export type Address = {
  street: string;
  city: string;
  postalCode: string | null;
  country: string;
};

export type UserPreferences = {
  digestOptIn: boolean;
  locale: string | null;
  currency: string;
  timeZone: string;
};

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  email: text('email').notNull(),
  name: text('name'),
  address: jsonb('address').$type<Address>(),
  preferences: jsonb('preferences').$type<UserPreferences>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull().default(''),
  priceCents: integer('price_cents').notNull(),
  /** Percentage off while the product is on sale; null when it is not. */
  salePercentOff: integer('sale_percent_off'),
  stock: integer('stock').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type CartLine = {
  productId: string;
  quantity: number;
};

export const carts = pgTable('carts', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  lines: jsonb('lines').$type<CartLine[]>(),
  promoCode: text('promo_code'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const promos = pgTable('promos', {
  code: text('code').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  percentOff: integer('percent_off').notNull(),
  active: boolean('active').notNull().default(true),
});

export type OrderLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export type OrderCoupon = {
  code: string;
  percentOff: number;
};

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  status: text('status').notNull().default('placed'),
  lines: jsonb('lines').$type<OrderLine[]>(),
  coupon: jsonb('coupon').$type<OrderCoupon>(),
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  discountCents: integer('discount_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type ProductInsert = typeof products.$inferInsert;
export type Cart = typeof carts.$inferSelect;
export type CartInsert = typeof carts.$inferInsert;
export type Promo = typeof promos.$inferSelect;
export type PromoInsert = typeof promos.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type OrderInsert = typeof orders.$inferInsert;
