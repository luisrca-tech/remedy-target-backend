import * as Sentry from "@sentry/bun";
import { Hono } from "hono";

import { sentryHttpMethod } from "./middleware/sentryHttpMethod.ts";

/**
 * Builds the Hono application. Kept as a factory so tests can construct a fresh
 * instance without starting a server.
 *
 * NOTE: the seeded business routes (orders/signup) are wired in a later Phase 1
 * task (T1.4). This scaffold provides the health endpoint plus the Sentry
 * `http.method` middleware and the app-level error handler.
 */
export function createApp(): Hono {
  const app = new Hono();

  // Stamp `http.method` on the current Sentry scope for every request, before
  // any route handler runs, so downstream errors carry the routing tag.
  app.use(sentryHttpMethod());

  app.get("/health", (c) => c.json({ status: "ok" }));

  // App-level error handler: capture the uncaught exception to Sentry (turning
  // it into a real incident) and return a 500 JSON response. The error is
  // preserved and reported, never swallowed.
  app.onError((err, c) => {
    Sentry.captureException(err);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}

export const app = createApp();
