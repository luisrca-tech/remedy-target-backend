import { describe, expect, it, mock, spyOn } from "bun:test";
import * as Sentry from "@sentry/bun";

import { createApp } from "../src/app.ts";

/**
 * These tests protect the single most correctness-critical behavior of the
 * service: the `http.method` tag that Remedy's `inferHarness` reads to route an
 * HTTP incident to the `http` harness. If the middleware stops stamping it,
 * every HTTP incident silently misroutes to `command` — so we assert the exact
 * `setTag("http.method", <METHOD>)` call, not just a 200 response.
 */
describe("http.method scope tag", () => {
  it("stamps the request method on the current Sentry scope for each request", async () => {
    const setTag = mock<(key: string, value: unknown) => unknown>(() => undefined);
    const scope = { setTag } as unknown as ReturnType<typeof Sentry.getCurrentScope>;
    const getCurrentScope = spyOn(Sentry, "getCurrentScope").mockReturnValue(scope);

    try {
      const app = createApp();

      await app.request("/health", { method: "GET" });
      // A path with no matching route still runs the global middleware, so the
      // POST method is stamped even though it resolves to a 404.
      await app.request("/does-not-exist", { method: "POST" });

      expect(setTag).toHaveBeenCalledWith("http.method", "GET");
      expect(setTag).toHaveBeenCalledWith("http.method", "POST");
    } finally {
      getCurrentScope.mockRestore();
    }
  });
});

describe("app error handler", () => {
  it("captures an uncaught route error and returns a 500 JSON response", async () => {
    const captureException = spyOn(Sentry, "captureException").mockImplementation(
      () => "test-event-id",
    );

    try {
      const app = createApp();
      app.get("/boom", () => {
        throw new Error("boom");
      });

      const res = await app.request("/boom");

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Internal Server Error" });

      expect(captureException).toHaveBeenCalledTimes(1);
      const capturedError = captureException.mock.calls[0]?.[0];
      expect(capturedError).toBeInstanceOf(Error);
      expect((capturedError as Error).message).toBe("boom");
    } finally {
      captureException.mockRestore();
    }
  });
});
