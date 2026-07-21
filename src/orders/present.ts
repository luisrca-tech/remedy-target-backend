import type { Order } from "../db/schema.ts";

export type OrderSummary = {
  id: string;
  status: string;
  placedAt: string;
  itemCount: number;
  totalCents: number;
};

export type OrderReceipt = OrderSummary & {
  lines: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  coupon: { code: string; percentOff: number } | null;
  subtotalCents: number;
  discountCents: number;
};

export function toOrderSummary(order: Order): OrderSummary {
  const lines = order.lines ?? [];
  return {
    id: order.id,
    status: order.status,
    placedAt: order.placedAt.toISOString(),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalCents: order.totalCents,
  };
}

export function toOrderReceipt(order: Order): OrderReceipt {
  const lines = order.lines ?? [];
  return {
    ...toOrderSummary(order),
    lines: lines.map((line) => ({
      ...line,
      lineTotalCents: line.unitPriceCents * line.quantity,
    })),
    coupon: order.coupon ?? null,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
  };
}
