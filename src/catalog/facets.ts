import { categoryLabel } from "./categories.ts";
import type { CatalogRows } from "./query.ts";

export type FacetHeader = {
  department: string;
  count: number;
  summary: string;
};

/**
 * One-line description of the slice the shopper is looking at, rendered above
 * the grid. The page takes its name from the department its rows sit in.
 */
export function buildFacetHeader(rows: CatalogRows): FacetHeader {
  const [lead] = rows;
  const department = categoryLabel(lead.category);
  const count = rows.length;

  return {
    department,
    count,
    summary: `${count} ${count === 1 ? "item" : "items"} in ${department}`,
  };
}
