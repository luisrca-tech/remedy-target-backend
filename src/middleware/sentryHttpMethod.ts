import * as Sentry from "@sentry/bun";
import { createMiddleware } from "hono/factory";

/**
 * Stamps `http.method` on the current Sentry scope for every request.
 *
 * This is the single most correctness-critical line in the service: Remedy's
 * `inferHarness` reads the `http.method` tag off an incident to decide whether
 * it belongs to the `http` harness. If the tag is missing or wrong, every HTTP
 * incident silently misroutes to `command`. Stamping it on the CURRENT scope
 * (which the Bun SDK isolates per request when Sentry is initialized) means any
 * error thrown by a downstream handler carries the tag.
 *
 * `Sentry.getCurrentScope()` returns a usable scope even when Sentry was never
 * initialized (empty DSN), so `setTag` is a safe no-op in tests/local dev and
 * never throws.
 */
export function sentryHttpMethod() {
  return createMiddleware(async (c, next) => {
    Sentry.getCurrentScope().setTag("http.method", c.req.method);
    await next();
  });
}
