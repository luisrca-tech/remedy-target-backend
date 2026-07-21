import { describe, expect, it } from "bun:test";

import { CATEGORY_LABELS, categoryLabel, departmentFor } from "../src/catalog/categories.ts";
import {
  parseCatalogParams,
  resolveCatalogPage,
  resolvePageWindow,
  rowsForPage,
} from "../src/catalog/query.ts";
import type { ProductSummary } from "../src/catalog/present.ts";

describe("parseCatalogParams", () => {
  it("applies defaults when nothing is supplied", () => {
    expect(parseCatalogParams({})).toEqual({ q: "", category: "", page: 1, perPage: 12 });
  });

  it("trims and lower-cases the search term", () => {
    expect(parseCatalogParams({ q: "  Kettle " }).q).toBe("kettle");
  });

  it("clamps the page to at least 1", () => {
    expect(parseCatalogParams({ page: "0" }).page).toBe(1);
    expect(parseCatalogParams({ page: "-3" }).page).toBe(1);
    expect(parseCatalogParams({ page: "banana" }).page).toBe(1);
  });

  it("clamps perPage into range", () => {
    expect(parseCatalogParams({ perPage: "1" }).perPage).toBe(1);
    expect(parseCatalogParams({ perPage: "500" }).perPage).toBe(48);
    expect(parseCatalogParams({ perPage: "0" }).perPage).toBe(12);
  });
});

describe("resolvePageWindow", () => {
  it("puts page 1 at the start of the result set", () => {
    expect(resolvePageWindow({ page: 1, perPage: 12, total: 40 })).toEqual({
      offset: 0,
      limit: 12,
      totalPages: 4,
    });
  });

  it("advances by exactly one page per step", () => {
    expect(resolvePageWindow({ page: 2, perPage: 12, total: 40 }).offset).toBe(12);
    expect(resolvePageWindow({ page: 3, perPage: 12, total: 40 }).offset).toBe(24);
  });

  it("keeps the last page inside the result set", () => {
    const { offset, totalPages } = resolvePageWindow({ page: 4, perPage: 12, total: 40 });
    expect(totalPages).toBe(4);
    expect(offset).toBe(36);
    expect(offset).toBeLessThan(40);
  });

  it("reports a single page when the catalog is empty", () => {
    expect(resolvePageWindow({ page: 1, perPage: 12, total: 0 })).toEqual({
      offset: 0,
      limit: 12,
      totalPages: 1,
    });
  });
});

describe("categoryLabel", () => {
  it("returns the configured label for a known category", () => {
    const known = Object.keys(CATEGORY_LABELS)[0]!;
    expect(categoryLabel(known)).toBe(CATEGORY_LABELS[known]!.label);
  });

  it("falls back to the raw category when it is not in the map", () => {
    expect(categoryLabel("not-a-real-category")).toBe("not-a-real-category");
  });
});

describe("departmentFor", () => {
  it("returns the label and blurb of a standing department", () => {
    expect(departmentFor("kitchen")).toEqual({
      label: "Kitchen",
      blurb: "Everyday tools for cooking and prep",
    });
  });

  it("covers every department the catalog navigates by", () => {
    for (const id of ["kitchen", "home", "stationery", "outdoors", "pantry"]) {
      expect(departmentFor(id).label.length).toBeGreaterThan(0);
      expect(departmentFor(id).blurb.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveCatalogPage", () => {
  it("carries the requested page size as the limit", () => {
    expect(resolveCatalogPage({ page: 1, perPage: 12, total: 41 }).limit).toBe(12);
    expect(resolveCatalogPage({ page: 2, perPage: 24, total: 41 }).limit).toBe(24);
  });

  it("counts the pages the result set spans", () => {
    expect(resolveCatalogPage({ page: 1, perPage: 12, total: 41 }).totalPages).toBe(4);
    expect(resolveCatalogPage({ page: 1, perPage: 12, total: 48 }).totalPages).toBe(4);
    expect(resolveCatalogPage({ page: 1, perPage: 12, total: 0 }).totalPages).toBe(1);
  });

  it("flags another page while one is left to serve", () => {
    expect(resolveCatalogPage({ page: 1, perPage: 12, total: 41 }).hasMore).toBe(true);
    expect(resolveCatalogPage({ page: 3, perPage: 12, total: 41 }).hasMore).toBe(true);
  });

  it("stops flagging more once the final page is reached", () => {
    expect(resolveCatalogPage({ page: 4, perPage: 12, total: 41 }).hasMore).toBe(false);
    expect(resolveCatalogPage({ page: 1, perPage: 12, total: 0 }).hasMore).toBe(false);
  });
});

describe("rowsForPage", () => {
  const summary = (id: string): ProductSummary => ({
    id,
    name: `Product ${id}`,
    slug: `product-${id}`,
    category: "kitchen",
    categoryLabel: "Kitchen",
    priceCents: 999,
    sale: null,
    inStock: true,
  });

  it("hands through the rows the window asked for", () => {
    const window = resolveCatalogPage({ page: 1, perPage: 12, total: 41 });
    const rows = [summary("prd_1"), summary("prd_2")];

    expect(rowsForPage(window, rows).map((row) => row.id)).toEqual(["prd_1", "prd_2"]);
  });

  it("never serves more rows than the page holds", () => {
    const window = resolveCatalogPage({ page: 1, perPage: 2, total: 41 });
    const rows = [summary("prd_1"), summary("prd_2"), summary("prd_3")];

    expect(rowsForPage(window, rows).map((row) => row.id)).toEqual(["prd_1", "prd_2"]);
  });
});
