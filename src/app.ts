import { Hono } from "hono";

/**
 * Builds the Hono application. Kept as a factory so tests can construct a fresh
 * instance without starting a server.
 *
 * NOTE: Sentry initialization, the `http.method` scope middleware, and the
 * seeded routes (orders/signup) are wired in later Phase 1 tasks (T1.2–T1.4).
 * This scaffold provides only the health endpoint so the project builds green.
 */
export function createApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
}

export const app = createApp();
