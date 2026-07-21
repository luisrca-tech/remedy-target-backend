import { describe, expect, it } from "bun:test";

import { buildFacetHeader } from "../src/catalog/facets.ts";
import type { ProductSummary } from "../src/catalog/present.ts";

const summary = (over: Partial<ProductSummary> = {}): ProductSummary => ({
  id: "prd_1",
  name: "Enamel kettle",
  slug: "enamel-kettle",
  category: "kitchen",
  categoryLabel: "Kitchen",
  priceCents: 1999,
  sale: null,
  inStock: true,
  ...over,
});

describe("buildFacetHeader", () => {
  it("names the page after the department of its rows", () => {
    const header = buildFacetHeader([summary(), summary({ id: "prd_2", name: "Tea strainer" })]);

    expect(header).toEqual({
      department: "Kitchen",
      count: 2,
      summary: "2 items in Kitchen",
    });
  });

  it("uses the raw category when the department has no display label", () => {
    const header = buildFacetHeader([summary({ category: "seasonal", categoryLabel: "seasonal" })]);

    expect(header).toEqual({
      department: "seasonal",
      count: 1,
      summary: "1 item in seasonal",
    });
  });
});
