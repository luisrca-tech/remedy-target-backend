export type CategoryLabel = {
  label: string;
  blurb: string;
};

/** The standing departments the storefront navigation is built from. */
export type DepartmentId = "kitchen" | "home" | "stationery" | "outdoors" | "pantry";

const DEPARTMENTS: Record<DepartmentId, CategoryLabel> = {
  kitchen: { label: "Kitchen", blurb: "Everyday tools for cooking and prep" },
  home: { label: "Home", blurb: "Small comforts for around the house" },
  stationery: { label: "Stationery", blurb: "Paper, pens and desk things" },
  outdoors: { label: "Outdoors", blurb: "For the garden, the trail and the balcony" },
  pantry: { label: "Pantry", blurb: "Shelf-stable staples and treats" },
};

export const CATEGORY_LABELS: Record<string, CategoryLabel> = DEPARTMENTS;

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category]?.label ?? category;
}

export function categoryBlurb(category: string): string {
  return CATEGORY_LABELS[category]?.blurb ?? "";
}

export function knownCategories(): string[] {
  return Object.keys(CATEGORY_LABELS);
}

/** The department a product hangs off, used to build its navigation trail. */
export function departmentFor(category: string): CategoryLabel {
  return DEPARTMENTS[category as DepartmentId];
}
