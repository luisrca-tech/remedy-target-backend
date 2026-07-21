import * as Sentry from "@sentry/bun";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { readEnv } from "./config/env.ts";
import { sentryHttpMethod } from "./middleware/sentryHttpMethod.ts";
import { cartsRoute } from "./routes/carts.ts";
import { checkoutRoute } from "./routes/checkout.ts";
import { ordersRoute } from "./routes/orders.ts";
import { productsRoute } from "./routes/products.ts";
import { signupRoute } from "./routes/signup.ts";
import { usersRoute } from "./routes/users.ts";

/** Built as a factory so tests can construct an instance without a server. */
export function createApp(): Hono {
  const app = new Hono();

  app.use(sentryHttpMethod());

  // The storefront calls this API directly from the browser, so its origin has
  // to be allowed here. Registered after the Sentry middleware so every
  // request, preflights included, is tagged first.
  app.use(
    "*",
    cors({
      origin: readEnv().CORS_ORIGINS,
      allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/products", productsRoute);
  app.route("/carts", cartsRoute);
  app.route("/checkout", checkoutRoute);
  app.route("/orders", ordersRoute);
  app.route("/users", usersRoute);
  app.route("/signup", signupRoute);

  // Report the failure and answer 500. The error is never swallowed.
  app.onError((err, c) => {
    Sentry.captureException(err);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}

export const app = createApp();
