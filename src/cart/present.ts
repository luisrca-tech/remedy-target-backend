import { quoteOrder } from "../checkout/pricing.ts";
import type { Cart, OrderCoupon, OrderLine, Product, Promo } from "../db/schema.ts";

export type CartViewLine = OrderLine & {
  lineTotalCents: number;
  available: boolean;
};

export type CartView = {
  id: string;
  userId: string;
  expiresAt: string;
  promo: OrderCoupon | null;
  lines: CartViewLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

export function couponFromPromo(promo: Promo | null): OrderCoupon | null {
  if (!promo || !promo.active) {
    return null;
  }
  return { code: promo.code, percentOff: promo.percentOff };
}

/**
 * Resolves a cart's stored lines against the catalog. Lines whose product has
 * since disappeared are kept, marked unavailable and priced at zero, so a
 * shopper can still see what they had rather than silently losing it.
 */
export function resolveCartLines(cart: Cart, catalog: readonly Product[]): CartViewLine[] {
  const byId = new Map(catalog.map((product) => [product.id, product]));

  return (cart.lines ?? []).map((line) => {
    const product = byId.get(line.productId);
    const unitPriceCents = product?.priceCents ?? 0;
    return {
      productId: line.productId,
      name: product?.name ?? "Unavailable item",
      quantity: line.quantity,
      unitPriceCents,
      lineTotalCents: unitPriceCents * line.quantity,
      available: product !== undefined,
    };
  });
}

export function buildCartView(
  cart: Cart,
  catalog: readonly Product[],
  promo: Promo | null,
): CartView {
  const lines = resolveCartLines(cart, catalog);
  const coupon = couponFromPromo(promo);
  const quote = quoteOrder(lines, coupon);

  return {
    id: cart.id,
    userId: cart.userId,
    expiresAt: cart.expiresAt.toISOString(),
    promo: coupon,
    lines,
    ...quote,
  };
}
