import type { OrderCoupon, OrderLine } from "../db/schema.ts";

export type OrderQuote = {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

export function subtotalCents(lines: readonly OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
}

/**
 * Prices an order. The discount is taken against the order subtotal and rounded
 * once, so the amount charged always matches the sum shown on the receipt.
 */
export function quoteOrder(
  lines: readonly OrderLine[],
  coupon: OrderCoupon | null,
): OrderQuote {
  const subtotal = subtotalCents(lines);
  const discount = coupon ? Math.round((subtotal * coupon.percentOff) / 100) : 0;
  return {
    subtotalCents: subtotal,
    discountCents: discount,
    totalCents: subtotal - discount,
  };
}
