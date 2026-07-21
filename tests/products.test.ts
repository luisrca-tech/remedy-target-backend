import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type { Product } from "../src/db/schema.ts";
import type { FacetHeader } from "../src/catalog/facets.ts";
import type {
  Breadcrumb,
  DepartmentCrumb,
  ProductDetail,
  ProductSummary,
} from "../src/catalog/present.ts";
import { jsonBody } from "./helpers.ts";

type ProductPage = {
  items: ProductSummary[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

type CatalogProductPage = ProductPage & {
  hasMore: boolean;
  facet: FacetHeader;
};

type ProductDetailWithTrail = Omit<ProductDetail, "breadcrumbs"> & {
  breadcrumbs: Array<Breadcrumb | DepartmentCrumb>;
};

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

let listed: Product[] = [];
let total = 0;
let found: Product | null = null;
let lastWindow: { offset: number; limit: number } | null = null;

mock.module("../src/catalog/repository.ts", () => ({
  countProducts: () => Promise.resolve(total),
  listProducts: (_filter: unknown, window: { offset: number; limit: number }) => {
    lastWindow = window;
    return Promise.resolve(listed);
  },
  findProduct: () => Promise.resolve(found),
}));

const { createApp } = await import("../src/app.ts");

beforeEach(() => {
  listed = [];
  total = 0;
  found = null;
  lastWindow = null;
});

describe("GET /products", () => {
  it("returns a page of summaries with paging metadata", async () => {
    listed = [product(), product({ id: "prd_2", name: "Linen towel", category: "home" })];
    total = 2;

    const res = await createApp().request("/products");
    expect(res.status).toBe(200);

    const body = await jsonBody<ProductPage>(res);
    expect(body.page).toBe(1);
    expect(body.perPage).toBe(12);
    expect(body.total).toBe(2);
    expect(body.totalPages).toBe(1);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      id: "prd_1",
      name: "Enamel kettle",
      categoryLabel: "Kitchen",
      priceCents: 1999,
      sale: null,
      inStock: true,
    });
  });

  it("starts page 1 at the first row", async () => {
    total = 40;
    await createApp().request("/products?page=1&perPage=12");
    expect(lastWindow).toMatchObject({ offset: 0, limit: 12 });
  });

  it("keeps the last page inside the result set", async () => {
    total = 40;
    await createApp().request("/products?page=4&perPage=12");
    expect(lastWindow?.offset).toBe(36);
  });

  it("reports a sale when the product has one", async () => {
    listed = [product({ priceCents: 850, salePercentOff: 15 })];
    total = 1;

    const body = await jsonBody<ProductPage>(await createApp().request("/products"));
    expect(body.items[0]?.sale).toEqual({ percentOff: 15, wasCents: 1000 });
  });
});

describe("GET /products/:id", () => {
  it("returns the detail with breadcrumbs", async () => {
    found = product();

    const res = await createApp().request("/products/prd_1");
    expect(res.status).toBe(200);

    const body = await jsonBody<ProductDetail>(res);
    expect(body.id).toBe("prd_1");
    expect(body.stock).toBe(4);
    expect(body.breadcrumbs).toEqual([
      { href: "/", label: "Catalog" },
      { href: "/?category=kitchen", label: "Kitchen" },
      { href: "/products/prd_1", label: "Enamel kettle" },
    ]);
  });

  it("labels a category that is not in the label map with its raw name", async () => {
    found = product({ category: "seasonal" });

    const body = await jsonBody<ProductDetail>(await createApp().request("/products/prd_1"));
    expect(body.categoryLabel).toBe("seasonal");
    expect(body.breadcrumbs[1]).toEqual({ href: "/?category=seasonal", label: "seasonal" });
  });

  it("returns 404 for an unknown product", async () => {
    found = null;

    const res = await createApp().request("/products/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Product not found" });
  });
});

describe("stock badges", () => {
  afterEach(() => {
    process.env.ROLLOUT_FLAGS = "";
  });

  it("leaves the summary shape alone while the badges are dark", async () => {
    listed = [product()];
    total = 1;

    const body = await jsonBody<ProductPage>(await createApp().request("/products"));
    expect(body.items[0]).not.toHaveProperty("stockStatus");
  });

  it("labels each shelf level once the badges are rolled out", async () => {
    process.env.ROLLOUT_FLAGS = "products-stock-badges";
    listed = [
      product({ id: "prd_1", stock: 0 }),
      product({ id: "prd_2", stock: 3 }),
      product({ id: "prd_3", stock: 30 }),
    ];
    total = 3;

    const body = await jsonBody<ProductPage>(await createApp().request("/products"));
    expect(body.items.map((item) => item.stockStatus)).toEqual([
      "out-of-stock",
      "low-stock",
      "in-stock",
    ]);
    expect(body.items.map((item) => item.inStock)).toEqual([false, true, true]);
  });

  it("carries the badge into the detail payload", async () => {
    process.env.ROLLOUT_FLAGS = "products-stock-badges";
    found = product({ stock: 2 });

    const body = await jsonBody<ProductDetail>(await createApp().request("/products/prd_1"));
    expect(body.stockStatus).toBe("low-stock");
  });
});

describe("the paged catalog", () => {
  beforeEach(() => {
    process.env.ROLLOUT_FLAGS = "catalog-pagination-v2";
  });

  afterEach(() => {
    process.env.ROLLOUT_FLAGS = "";
  });

  it("heads the page with the department its rows sit in", async () => {
    listed = [product(), product({ id: "prd_2", name: "Tea strainer" })];
    total = 41;

    const res = await createApp().request("/products?page=1&perPage=12");
    expect(res.status).toBe(200);

    const body = await jsonBody<CatalogProductPage>(res);
    expect(body.facet).toEqual({
      department: "Kitchen",
      count: 2,
      summary: "2 items in Kitchen",
    });
    expect(body.totalPages).toBe(4);
    expect(body.hasMore).toBe(true);
  });

  it("stops advertising more pages on the final one", async () => {
    listed = [product()];
    total = 41;

    const body = await jsonBody<CatalogProductPage>(
      await createApp().request("/products?page=4&perPage=12"),
    );
    expect(body.page).toBe(4);
    expect(body.perPage).toBe(12);
    expect(body.total).toBe(41);
    expect(body.totalPages).toBe(4);
    expect(body.hasMore).toBe(false);
  });

  it("keeps the facet header out of the response while it is dark", async () => {
    process.env.ROLLOUT_FLAGS = "";
    listed = [product()];
    total = 41;

    const body = await jsonBody<ProductPage>(await createApp().request("/products?page=1"));
    expect(body).not.toHaveProperty("facet");
    expect(body).not.toHaveProperty("hasMore");
  });
});

describe("the department trail", () => {
  beforeEach(() => {
    process.env.ROLLOUT_FLAGS = "catalog-breadcrumbs";
  });

  afterEach(() => {
    process.env.ROLLOUT_FLAGS = "";
  });

  it("hangs the product off its department, blurb and all", async () => {
    found = product();

    const res = await createApp().request("/products/prd_1");
    expect(res.status).toBe(200);

    const body = await jsonBody<ProductDetailWithTrail>(res);
    expect(body.breadcrumbs).toEqual([
      { href: "/", label: "Catalog" },
      {
        href: "/?category=kitchen",
        label: "Kitchen",
        blurb: "Everyday tools for cooking and prep",
      },
      { href: "/products/prd_1", label: "Enamel kettle" },
    ]);
  });

  it("keeps the rest of the detail payload as it was", async () => {
    found = product({ category: "pantry", name: "Sea salt flakes" });

    const body = await jsonBody<ProductDetailWithTrail>(
      await createApp().request("/products/prd_1"),
    );
    expect(body.id).toBe("prd_1");
    expect(body.categoryLabel).toBe("Pantry");
    expect(body.stock).toBe(4);
  });

  it("serves the plain trail while the enriched one is dark", async () => {
    process.env.ROLLOUT_FLAGS = "";
    found = product();

    const body = await jsonBody<ProductDetail>(await createApp().request("/products/prd_1"));
    expect(body.breadcrumbs).toEqual([
      { href: "/", label: "Catalog" },
      { href: "/?category=kitchen", label: "Kitchen" },
      { href: "/products/prd_1", label: "Enamel kettle" },
    ]);
  });
});
