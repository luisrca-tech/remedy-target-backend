import { describe, expect, it } from "bun:test";

import { isRolloutEnabled } from "../src/config/rollout.ts";

describe("isRolloutEnabled", () => {
  it("treats an empty value as nothing rolled out", () => {
    expect(isRolloutEnabled("catalog-breadcrumbs", "")).toBe(false);
    expect(isRolloutEnabled("orders-status-filter", "")).toBe(false);
  });

  it("enables exactly the listed flags", () => {
    expect(isRolloutEnabled("catalog-breadcrumbs", "catalog-breadcrumbs")).toBe(true);
    expect(isRolloutEnabled("orders-status-filter", "catalog-breadcrumbs")).toBe(false);
  });

  it("accepts several flags and ignores surrounding whitespace", () => {
    const raw = " catalog-breadcrumbs , orders-status-filter ";
    expect(isRolloutEnabled("catalog-breadcrumbs", raw)).toBe(true);
    expect(isRolloutEnabled("orders-status-filter", raw)).toBe(true);
    expect(isRolloutEnabled("products-stock-badges", raw)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isRolloutEnabled("catalog-breadcrumbs", "CATALOG-BREADCRUMBS")).toBe(true);
  });

  it("ignores unknown flags rather than throwing", () => {
    expect(() => isRolloutEnabled("catalog-breadcrumbs", "nope,also-nope")).not.toThrow();
    expect(isRolloutEnabled("catalog-breadcrumbs", "nope")).toBe(false);
  });

  it("enables everything under `all`", () => {
    expect(isRolloutEnabled("catalog-breadcrumbs", "all")).toBe(true);
    expect(isRolloutEnabled("orders-status-filter", "all")).toBe(true);
  });

  it("treats a bare flag as an exclusion once `all` is present", () => {
    const raw = "all,catalog-breadcrumbs";
    expect(isRolloutEnabled("catalog-breadcrumbs", raw)).toBe(false);
    expect(isRolloutEnabled("orders-status-filter", raw)).toBe(true);
  });

  it("honours an explicit `-` or `!` exclusion", () => {
    expect(isRolloutEnabled("catalog-breadcrumbs", "all,-catalog-breadcrumbs")).toBe(false);
    expect(isRolloutEnabled("catalog-breadcrumbs", "all,!catalog-breadcrumbs")).toBe(false);
  });

  it("is order-independent", () => {
    expect(isRolloutEnabled("catalog-breadcrumbs", "catalog-breadcrumbs,all")).toBe(false);
  });
});
