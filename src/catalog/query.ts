import type { ProductSummary } from "./present.ts";

export type CatalogParams = {
  q: string;
  category: string;
  page: number;
  perPage: number;
};

export type PageWindow = {
  offset: number;
  limit: number;
  totalPages: number;
};

export type CatalogPage = PageWindow & {
  hasMore: boolean;
};

/** The rows a catalog page serves. The first row is the one the page is named for. */
export type CatalogRows = [ProductSummary, ...ProductSummary[]];

const DEFAULT_PER_PAGE = 12;
const MAX_PER_PAGE = 48;

function toPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export function parseCatalogParams(query: Record<string, string | undefined>): CatalogParams {
  return {
    q: (query.q ?? "").trim().toLowerCase(),
    category: (query.category ?? "").trim().toLowerCase(),
    page: Math.max(1, toPositiveInt(query.page, 1)),
    perPage: Math.min(MAX_PER_PAGE, toPositiveInt(query.perPage, DEFAULT_PER_PAGE)),
  };
}

export function resolvePageWindow(input: {
  page: number;
  perPage: number;
  total: number;
}): PageWindow {
  const { page, perPage, total } = input;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return {
    offset: (page - 1) * perPage,
    limit: perPage,
    totalPages,
  };
}

/**
 * Window for the catalog grid. The storefront pages forward from a cursor, so
 * the window also reports whether another page follows this one.
 */
export function resolveCatalogPage(input: {
  page: number;
  perPage: number;
  total: number;
}): CatalogPage {
  const { page, perPage, total } = input;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const cursor = page * perPage;

  return {
    offset: cursor,
    limit: perPage,
    totalPages,
    hasMore: page < totalPages,
  };
}

/**
 * The rows a resolved window selected, trimmed to the size the window asked
 * for. The window is sized from the row count, so the slice it names is what
 * the page is made of.
 */
export function rowsForPage(window: CatalogPage, rows: ProductSummary[]): CatalogRows {
  return rows.slice(0, window.limit) as CatalogRows;
}
