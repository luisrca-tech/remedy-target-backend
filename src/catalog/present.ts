import { categoryBlurb, categoryLabel } from "./categories.ts";
import { isRolloutEnabled } from "../config/rollout.ts";
import type { Product } from "../db/schema.ts";

export type SaleInfo = {
  percentOff: number;
  wasCents: number;
};

/** How the storefront badges availability on a product card. */
export type StockStatus = "in-stock" | "low-stock" | "out-of-stock";

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  category: string;
  categoryLabel: string;
  priceCents: number;
  sale: SaleInfo | null;
  inStock: boolean;
  stockStatus?: StockStatus;
};

export type Breadcrumb = {
  href: string;
  label: string;
};

/** A breadcrumb that also carries the department's shelf copy. */
export type DepartmentCrumb = Breadcrumb & {
  blurb: string;
};

export type ProductDetail = ProductSummary & {
  description: string;
  stock: number;
  breadcrumbs: Breadcrumb[];
};

/** Below this many units the storefront nudges the shopper to buy now. */
const LOW_STOCK_THRESHOLD = 5;

export function stockStatusFor(stock: number): StockStatus {
  if (stock <= 0) {
    return "out-of-stock";
  }
  if (stock <= LOW_STOCK_THRESHOLD) {
    return "low-stock";
  }
  return "in-stock";
}

function saleFor(product: Product): SaleInfo | null {
  if (product.salePercentOff === null) {
    return null;
  }
  return {
    percentOff: product.salePercentOff,
    wasCents: Math.round((product.priceCents * 100) / (100 - product.salePercentOff)),
  };
}

export function toProductSummary(product: Product): ProductSummary {
  const summary: ProductSummary = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    category: product.category,
    categoryLabel: categoryLabel(product.category),
    priceCents: product.priceCents,
    sale: saleFor(product),
    inStock: product.stock > 0,
  };

  if (isRolloutEnabled("products-stock-badges")) {
    summary.stockStatus = stockStatusFor(product.stock);
  }

  return summary;
}

export function toProductDetail(product: Product): ProductDetail {
  return {
    ...toProductSummary(product),
    description: product.description || categoryBlurb(product.category),
    stock: product.stock,
    breadcrumbs: [
      { href: "/", label: "Catalog" },
      { href: `/?category=${product.category}`, label: categoryLabel(product.category) },
      { href: `/products/${product.id}`, label: product.name },
    ],
  };
}
