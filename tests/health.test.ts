import { describe, expect, it } from "bun:test";
import { createApp } from "../src/app.ts";
import { isBugEnabled } from "../src/config/enabledBugs.ts";

describe("app", () => {
  it("responds ok on /health", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("window discipline (ENABLED_BUGS)", () => {
  it("treats an empty flag as all bugs disabled", () => {
    expect(isBugEnabled("BH1", "")).toBe(false);
    expect(isBugEnabled("BC1", "")).toBe(false);
  });

  it("enables exactly the selected bug", () => {
    expect(isBugEnabled("BH1", "BH1")).toBe(true);
    expect(isBugEnabled("BC1", "BH1")).toBe(false);
  });

  it("ignores unknown ids", () => {
    expect(isBugEnabled("BH1", "NOPE")).toBe(false);
  });
});
