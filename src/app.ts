import * as Sentry from "@sentry/bun";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { readEnv } from "./config/env.ts";
import { sentryHttpMethod } from "./middleware/sentryHttpMethod.ts";
import { cartsRoute } from "./routes/carts.ts";
import { ordersRoute } from "./routes/orders.ts";
import { signupRoute } from "./routes/signup.ts";
import { usersRoute } from "./routes/users.ts";

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

  // CORS for the sibling frontend, which calls this API directly from the
  // browser. Registered AFTER `sentryHttpMethod` so the Sentry tag is still
  // stamped first for every request, including preflights.
  app.use(
    "*",
    cors({
      origin: readEnv().CORS_ORIGINS,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Seeded business route (T1.4). Hosts the BH1 defect (gated by ENABLED_BUGS).
  app.route("/orders", ordersRoute);

  // Seeded business route. Hosts the BH2 signup-contract defect (gated by ENABLED_BUGS).
  app.route("/signup", signupRoute);

  // Plain read routes consumed cross-origin by the sibling frontend. No seeded
  // defect lives here — the frontend hosts its own.
  app.route("/users", usersRoute);
  app.route("/carts", cartsRoute);

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
