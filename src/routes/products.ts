import { Hono } from "hono";

import { departmentFor } from "../catalog/categories.ts";
import { buildFacetHeader } from "../catalog/facets.ts";
import { toProductDetail, toProductSummary } from "../catalog/present.ts";
import type { Breadcrumb, DepartmentCrumb } from "../catalog/present.ts";
import {
  parseCatalogParams,
  resolveCatalogPage,
  resolvePageWindow,
  rowsForPage,
} from "../catalog/query.ts";
import { countProducts, findProduct, listProducts } from "../catalog/repository.ts";
import { isRolloutEnabled } from "../config/rollout.ts";
import { DEFAULT_TENANT_ID } from "../config/tenant.ts";

export const productsRoute = new Hono();

productsRoute.get("/", async (c) => {
  const params = parseCatalogParams(c.req.query());
  const filter = { tenantId: DEFAULT_TENANT_ID, q: params.q, category: params.category };

  const total = await countProducts(filter);

  if (isRolloutEnabled("catalog-pagination-v2")) {
    const catalogPage = resolveCatalogPage({
      page: params.page,
      perPage: params.perPage,
      total,
    });
    const rows = rowsForPage(
      catalogPage,
      (await listProducts(filter, catalogPage)).map(toProductSummary),
    );

    return c.json({
      items: rows,
      page: params.page,
      perPage: params.perPage,
      total,
      totalPages: catalogPage.totalPages,
      hasMore: catalogPage.hasMore,
      facet: buildFacetHeader(rows),
    });
  }

  const window = resolvePageWindow({ page: params.page, perPage: params.perPage, total });
  const rows = await listProducts(filter, window);

  return c.json({
    items: rows.map(toProductSummary),
    page: params.page,
    perPage: params.perPage,
    total,
    totalPages: window.totalPages,
  });
});

productsRoute.get("/:id", async (c) => {
  const product = await findProduct(DEFAULT_TENANT_ID, c.req.param("id"));

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  const detail = toProductDetail(product);

  if (!isRolloutEnabled("catalog-breadcrumbs")) {
    return c.json(detail);
  }

  const department = departmentFor(product.category);
  const trail: Array<Breadcrumb | DepartmentCrumb> = [
    { href: "/", label: "Catalog" },
    {
      href: `/?category=${product.category}`,
      label: department.label,
      blurb: department.blurb,
    },
    { href: `/products/${product.id}`, label: product.name },
  ];

  return c.json({ ...detail, breadcrumbs: trail });
});
