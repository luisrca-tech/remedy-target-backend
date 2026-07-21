import * as Sentry from "@sentry/bun";
import { createMiddleware } from "hono/factory";

/**
 * Stamps `http.method` on the current Sentry scope for every request, so an
 * error thrown by any downstream handler is reported with the method that
 * caused it. Stamped on the CURRENT scope, which the Bun SDK isolates per
 * request once Sentry is initialized.
 *
 * `getCurrentScope()` returns a usable scope even when Sentry was never
 * initialized, so this is a safe no-op with an empty DSN.
 */
export function sentryHttpMethod() {
  return createMiddleware(async (c, next) => {
    Sentry.getCurrentScope().setTag("http.method", c.req.method);
    await next();
  });
}
