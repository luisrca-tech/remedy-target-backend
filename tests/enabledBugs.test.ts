import { describe, expect, it } from "bun:test";
import { isBugEnabled } from "../src/config/enabledBugs.ts";

describe("ENABLED_BUGS selection", () => {
  it("empty selects nothing (the checks state)", () => {
    for (const id of ["BH1", "BH2", "BC1"] as const) {
      expect(isBugEnabled(id, "")).toBe(false);
    }
  });

  it("a single id enables only that bug", () => {
    expect(isBugEnabled("BH1", "BH1")).toBe(true);
    expect(isBugEnabled("BH2", "BH1")).toBe(false);
    expect(isBugEnabled("BC1", "BH1")).toBe(false);
  });

  it("an explicit list enables exactly those ids", () => {
    expect(isBugEnabled("BH1", "BH1,BC1")).toBe(true);
    expect(isBugEnabled("BC1", "BH1,BC1")).toBe(true);
    expect(isBugEnabled("BH2", "BH1,BC1")).toBe(false);
  });

  it("ALL enables every known bug", () => {
    for (const id of ["BH1", "BH2", "BC1"] as const) {
      expect(isBugEnabled(id, "ALL")).toBe(true);
    }
  });

  it("ALL is case-insensitive", () => {
    expect(isBugEnabled("BH1", "all")).toBe(true);
    expect(isBugEnabled("BC1", "All")).toBe(true);
  });

  it("ALL with a bare id treats it as an exclusion", () => {
    expect(isBugEnabled("BH1", "ALL,BH2")).toBe(true);
    expect(isBugEnabled("BC1", "ALL,BH2")).toBe(true);
    expect(isBugEnabled("BH2", "ALL,BH2")).toBe(false);
  });

  it("bare-id exclusion under ALL is order-independent", () => {
    // `ALL` appearing after the id must still make the bare id an exclusion.
    expect(isBugEnabled("BH2", "BH2,ALL")).toBe(false);
    expect(isBugEnabled("BH1", "BH2,ALL")).toBe(true);
  });

  it("ALL with several bare ids excludes all of them", () => {
    expect(isBugEnabled("BH1", "ALL,BH2,BC1")).toBe(true);
    expect(isBugEnabled("BH2", "ALL,BH2,BC1")).toBe(false);
    expect(isBugEnabled("BC1", "ALL,BH2,BC1")).toBe(false);
  });

  it("ALL with a '-' exclusion enables everything except the excluded id", () => {
    expect(isBugEnabled("BH1", "ALL,-BH2")).toBe(true);
    expect(isBugEnabled("BC1", "ALL,-BH2")).toBe(true);
    expect(isBugEnabled("BH2", "ALL,-BH2")).toBe(false);
  });

  it("ALL with a '!' exclusion works the same as '-'", () => {
    expect(isBugEnabled("BC1", "ALL,!BC1")).toBe(false);
    expect(isBugEnabled("BH1", "ALL,!BC1")).toBe(true);
  });

  it("multiple exclusions all apply", () => {
    expect(isBugEnabled("BH1", "ALL,-BH2,-BC1")).toBe(true);
    expect(isBugEnabled("BH2", "ALL,-BH2,-BC1")).toBe(false);
    expect(isBugEnabled("BC1", "ALL,-BH2,-BC1")).toBe(false);
  });

  it("bug ids are matched case-insensitively", () => {
    expect(isBugEnabled("BH1", "bh1")).toBe(true);
  });

  it("unknown ids are ignored, never enabling a real bug", () => {
    expect(isBugEnabled("BH1", "NOPE")).toBe(false);
    expect(isBugEnabled("BH1", "BH99,FOO")).toBe(false);
  });

  it("an unknown exclusion does not remove real bugs", () => {
    expect(isBugEnabled("BH1", "ALL,-NOPE")).toBe(true);
    expect(isBugEnabled("BH2", "ALL,-NOPE")).toBe(true);
  });

  it("whitespace around tokens is tolerated", () => {
    expect(isBugEnabled("BH1", " ALL , -BH2 ")).toBe(true);
    expect(isBugEnabled("BH2", " ALL , -BH2 ")).toBe(false);
  });
});
