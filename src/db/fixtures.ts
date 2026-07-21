import { DEFAULT_TENANT_ID } from "../config/tenant.ts";
import type { CartInsert, OrderInsert, ProductInsert, PromoInsert, UserInsert } from "./schema.ts";

/**
 * Fixture data for local development and the test tenant.
 *
 * Timestamps are derived from the moment of seeding rather than hardcoded, so a
 * freshly loaded database always has orders inside the digest's rolling window.
 */

const tenantId = DEFAULT_TENANT_ID;

/** [id, name, category, priceCents, salePercentOff, stock] */
type ProductRow = [string, string, string, number, number | null, number];

const PRODUCT_ROWS: ProductRow[] = [
  ["prd_1a04", "Enamel stovetop kettle", "kitchen", 1999, null, 12],
  ["prd_1b17", "Cast iron skillet, 26cm", "kitchen", 3499, 15, 6],
  ["prd_1c29", "Beech chopping board", "kitchen", 1299, null, 20],
  ["prd_1d3e", "Wooden spoon, set of three", "kitchen", 849, null, 40],
  ["prd_1e45", "Measuring jug, 1L", "kitchen", 449, null, 31],
  ["prd_1f58", "Tea strainer", "kitchen", 329, null, 55],
  ["prd_2a61", "Stoneware mug", "kitchen", 599, null, 48],
  ["prd_2b74", "Linen tea towel", "kitchen", 349, null, 60],
  ["prd_2c88", "Silicone spatula", "kitchen", 279, null, 72],
  ["prd_2d90", "Jar funnel", "kitchen", 199, null, 80],
  ["prd_3a02", "Waffle-weave bath towel", "home", 1899, null, 18],
  ["prd_3b15", "Rattan storage basket", "home", 2499, 20, 9],
  ["prd_3c27", "Beeswax candle, tall", "home", 1199, null, 34],
  ["prd_3d39", "Cotton throw blanket", "home", 3999, null, 7],
  ["prd_3e41", "Ceramic plant pot", "home", 1499, null, 22],
  ["prd_3f53", "Door draught excluder", "home", 999, null, 15],
  ["prd_4a66", "Wool dryer balls", "home", 749, null, 41],
  ["prd_4b78", "Picture hook assortment", "home", 399, null, 66],
  ["prd_4c81", "Dot-grid notebook, A5", "stationery", 899, null, 52],
  ["prd_4d93", "Fountain pen, medium nib", "stationery", 2299, 10, 11],
  ["prd_5a05", "Pencil set, HB to 6B", "stationery", 749, null, 38],
  ["prd_5b18", "Kraft envelopes, pack of 25", "stationery", 449, null, 45],
  ["prd_5c20", "Washi tape, three rolls", "stationery", 599, null, 50],
  ["prd_5d32", "Desk blotter", "stationery", 1699, null, 13],
  ["prd_5e44", "Ink cartridges, pack of six", "stationery", 349, null, 70],
  ["prd_5f57", "Bookmark, brass", "stationery", 279, null, 58],
  ["prd_6a69", "Secateurs, bypass", "outdoors", 2799, null, 10],
  ["prd_6b72", "Galvanised watering can", "outdoors", 2199, 25, 8],
  ["prd_6c84", "Gardening gloves", "outdoors", 1299, null, 27],
  ["prd_6d96", "Seed tray, set of five", "outdoors", 899, null, 33],
  ["prd_7a08", "Bamboo plant labels", "outdoors", 399, null, 61],
  ["prd_7b11", "Folding camp stool", "outdoors", 3299, null, 5],
  ["prd_7c23", "Vacuum flask, 500ml", "outdoors", 1999, null, 19],
  ["prd_7d35", "Olive oil, 500ml", "pantry", 1099, null, 29],
  ["prd_7e47", "Sea salt flakes", "pantry", 449, null, 64],
  ["prd_7f59", "Wildflower honey", "pantry", 899, 15, 21],
  ["prd_8a62", "Loose-leaf breakfast tea", "pantry", 749, null, 37],
  ["prd_8b75", "Ground coffee, 250g", "pantry", 1199, null, 26],
  ["prd_8c87", "Oat biscuits", "pantry", 329, null, 73],
  ["prd_8d99", "Marmalade, thick cut", "pantry", 599, null, 44],
  // Stocked for a seasonal promotion; not one of the standing departments.
  ["prd_9c21", "Advent candle holder", "seasonal", 1599, null, 14],
];

export const PRODUCTS: ProductInsert[] = PRODUCT_ROWS.map(
  ([id, name, category, priceCents, salePercentOff, stock]) => ({
    id,
    tenantId,
    name,
    slug: name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    category,
    description: `${name}. Sold by Sundry.`,
    priceCents,
    salePercentOff,
    stock,
  }),
);

export const PROMOS: PromoInsert[] = [
  { code: "SAVE15", tenantId, percentOff: 15, active: true },
  { code: "SAVE20", tenantId, percentOff: 20, active: true },
  { code: "SAVE40", tenantId, percentOff: 40, active: true },
  { code: "OLD10", tenantId, percentOff: 10, active: false },
];

export const USERS: UserInsert[] = [
  {
    id: "usr_4b8e",
    tenantId,
    email: "ana@example.com",
    name: "Ana",
    address: { street: "Rua Aurora 148", city: "São Paulo", postalCode: "01209-001", country: "BR" },
    preferences: { digestOptIn: true, locale: null, currency: "BRL", timeZone: "America/Sao_Paulo" },
  },
  {
    id: "usr_2d10",
    tenantId,
    email: "joao@example.com",
    name: "João",
    address: { street: "Rua das Flores 12", city: "Porto", postalCode: "4000-007", country: "PT" },
    preferences: { digestOptIn: true, locale: "pt-PT", currency: "EUR", timeZone: "Europe/Lisbon" },
  },
  {
    id: "usr_91cc",
    tenantId,
    email: "sam@example.com",
    name: "Sam",
    address: { street: "9 Bridge Street", city: "Bristol", postalCode: "BS1 2AA", country: "GB" },
    preferences: { digestOptIn: false, locale: "en-GB", currency: "GBP", timeZone: "Europe/London" },
  },
  {
    id: "usr_5e77",
    tenantId,
    email: "newcomer@example.com",
    name: null,
    address: null,
    preferences: null,
  },
];

export const CARTS: CartInsert[] = [
  {
    id: "cart_live",
    tenantId,
    userId: "usr_2d10",
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    lines: [
      { productId: "prd_1a04", quantity: 1 },
      { productId: "prd_1c29", quantity: 1 },
    ],
    promoCode: "SAVE20",
  },
  {
    id: "cart_a71f",
    tenantId,
    userId: "usr_4b8e",
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    lines: [
      { productId: "prd_1c29", quantity: 1 },
      { productId: "prd_1d3e", quantity: 1 },
      { productId: "prd_1e45", quantity: 1 },
      { productId: "prd_1f58", quantity: 1 },
    ],
    promoCode: "SAVE20",
  },
  {
    id: "cart_c930",
    tenantId,
    userId: "usr_91cc",
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    lines: [
      { productId: "prd_2a61", quantity: 1 },
      { productId: "prd_1e45", quantity: 1 },
      { productId: "prd_2b74", quantity: 1 },
      { productId: "prd_2c88", quantity: 1 },
      { productId: "prd_2d90", quantity: 1 },
    ],
    promoCode: "SAVE40",
  },
  {
    id: "cart_lapsed",
    tenantId,
    userId: "usr_91cc",
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    lines: [],
    promoCode: null,
  },
];

/** Today at 02:15 UTC — the previous calendar day anywhere west of UTC. */
function earlyHoursUtc(daysAgo: number): Date {
  const day = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 2, 15, 0),
  );
}

function middayUtc(daysAgo: number): Date {
  const day = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12, 30, 0),
  );
}

export const ORDERS: OrderInsert[] = [
  {
    id: "ord_7f3a",
    tenantId,
    userId: "usr_4b8e",
    status: "placed",
    lines: [
      { productId: "prd_3b15", name: "Rattan storage basket", quantity: 1, unitPriceCents: 2499 },
      { productId: "prd_3c27", name: "Beeswax candle, tall", quantity: 2, unitPriceCents: 1199 },
    ],
    coupon: null,
    subtotalCents: 4897,
    discountCents: 0,
    totalCents: 4897,
    placedAt: earlyHoursUtc(0),
  },
  {
    id: "ord_b204",
    tenantId,
    userId: "usr_4b8e",
    status: "delivered",
    lines: [{ productId: "prd_8b75", name: "Ground coffee, 250g", quantity: 3, unitPriceCents: 1199 }],
    coupon: { code: "SAVE15", percentOff: 15 },
    subtotalCents: 3597,
    discountCents: 540,
    totalCents: 3057,
    placedAt: middayUtc(3),
  },
  {
    id: "ord_c518",
    tenantId,
    userId: "usr_2d10",
    status: "placed",
    lines: [{ productId: "prd_4d93", name: "Fountain pen, medium nib", quantity: 1, unitPriceCents: 2299 }],
    coupon: null,
    subtotalCents: 2299,
    discountCents: 0,
    totalCents: 2299,
    placedAt: middayUtc(1),
  },
  {
    id: "ord_d63c",
    tenantId,
    userId: "usr_2d10",
    status: "delivered",
    lines: [
      { productId: "prd_6b72", name: "Galvanised watering can", quantity: 1, unitPriceCents: 2199 },
      { productId: "prd_7a08", name: "Bamboo plant labels", quantity: 2, unitPriceCents: 399 },
    ],
    coupon: { code: "SAVE20", percentOff: 20 },
    subtotalCents: 2997,
    discountCents: 599,
    totalCents: 2398,
    placedAt: middayUtc(5),
  },
  {
    id: "ord_e741",
    tenantId,
    userId: "usr_91cc",
    status: "cancelled",
    lines: [{ productId: "prd_7b11", name: "Folding camp stool", quantity: 1, unitPriceCents: 3299 }],
    coupon: null,
    subtotalCents: 3299,
    discountCents: 0,
    totalCents: 3299,
    placedAt: middayUtc(2),
  },
];
