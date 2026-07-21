import { afterEach, describe, expect, it } from "bun:test";

import { stockStatusFor, toProductDetail, toProductSummary } from "../src/catalog/present.ts";
import type { Product } from "../src/db/schema.ts";

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: "prd_1",
    tenantId: "sundry",
    name: "Enamel kettle",
    slug: "enamel-kettle",
    category: "kitchen",
    description: "A kettle.",
    priceCents: 1999,
    salePercentOff: null,
    stock: 4,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  }) as Product;

afterEach(() => {
  process.env.ROLLOUT_FLAGS = "";
});

describe("stockStatusFor", () => {
  it("marks a product with no units as out of stock", () => {
    expect(stockStatusFor(0)).toBe("out-of-stock");
  });

  it("marks the last few units as low stock", () => {
    expect(stockStatusFor(1)).toBe("low-stock");
    expect(stockStatusFor(5)).toBe("low-stock");
  });

  it("marks a healthy shelf as in stock", () => {
    expect(stockStatusFor(6)).toBe("in-stock");
    expect(stockStatusFor(400)).toBe("in-stock");
  });
});

describe("toProductSummary", () => {
  it("omits the stock status until the badges are rolled out", () => {
    expect(toProductSummary(product())).not.toHaveProperty("stockStatus");
  });

  it("adds the stock status once the badges are rolled out", () => {
    process.env.ROLLOUT_FLAGS = "products-stock-badges";

    expect(toProductSummary(product({ stock: 0 })).stockStatus).toBe("out-of-stock");
    expect(toProductSummary(product({ stock: 2 })).stockStatus).toBe("low-stock");
    expect(toProductSummary(product({ stock: 30 })).stockStatus).toBe("in-stock");
  });

  it("keeps the availability boolean unchanged when the badges are on", () => {
    process.env.ROLLOUT_FLAGS = "products-stock-badges";

    expect(toProductSummary(product({ stock: 0 })).inStock).toBe(false);
    expect(toProductSummary(product({ stock: 2 })).inStock).toBe(true);
  });
});

describe("toProductDetail", () => {
  it("carries the stock status into the detail payload when rolled out", () => {
    process.env.ROLLOUT_FLAGS = "products-stock-badges";

    const detail = toProductDetail(product({ stock: 3 }));
    expect(detail.stockStatus).toBe("low-stock");
    expect(detail.stock).toBe(3);
  });
});
