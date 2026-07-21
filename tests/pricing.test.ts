import { describe, expect, it } from "bun:test";

import { quoteOrder, subtotalCents } from "../src/checkout/pricing.ts";

const lines = [
  { productId: "prd_a", name: "A", quantity: 2, unitPriceCents: 1999 },
  { productId: "prd_b", name: "B", quantity: 1, unitPriceCents: 449 },
];

describe("subtotalCents", () => {
  it("multiplies unit price by quantity across lines", () => {
    expect(subtotalCents(lines)).toBe(4447);
  });

  it("is zero for an empty cart", () => {
    expect(subtotalCents([])).toBe(0);
  });
});

describe("quoteOrder", () => {
  it("charges the subtotal when there is no coupon", () => {
    expect(quoteOrder(lines, null)).toEqual({
      subtotalCents: 4447,
      discountCents: 0,
      totalCents: 4447,
    });
  });

  it("applies the discount to the order subtotal, rounding once", () => {
    expect(quoteOrder(lines, { code: "SAVE15", percentOff: 15 })).toEqual({
      subtotalCents: 4447,
      discountCents: 667,
      totalCents: 3780,
    });
  });

  it("rounds the whole-order discount rather than each line", () => {
    const threeLines = [
      { productId: "prd_a", name: "A", quantity: 1, unitPriceCents: 199 },
      { productId: "prd_b", name: "B", quantity: 1, unitPriceCents: 199 },
      { productId: "prd_c", name: "C", quantity: 1, unitPriceCents: 199 },
    ];
    const quote = quoteOrder(threeLines, { code: "SAVE33", percentOff: 33 });

    expect(quote.subtotalCents).toBe(597);
    expect(quote.discountCents).toBe(197);
    expect(quote.totalCents).toBe(400);

    const perLine = threeLines.reduce(
      (sum, line) => sum + Math.round(line.unitPriceCents * line.quantity * 0.33),
      0,
    );
    expect(perLine).toBe(198);
    expect(quote.discountCents).not.toBe(perLine);
  });

  it("never discounts below zero", () => {
    expect(quoteOrder(lines, { code: "FREE", percentOff: 100 }).totalCents).toBe(0);
  });
});
