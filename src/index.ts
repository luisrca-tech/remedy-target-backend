// Instrument first: `initSentry` must run before `Bun.serve` below so the Bun
// SDK can auto-instrument the server (per-request isolation scopes) before the
// first request lands.
import { initSentry } from "./instrument.ts";
import { app } from "./app.ts";
import { env } from "./config/env.ts";

initSentry();

/**
 * Bun serves the Hono app. Railway sets PORT and RAILWAY_GIT_COMMIT_SHA at
 * runtime; the Sentry release is derived from RAILWAY_GIT_COMMIT_SHA.
 */
const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`sundry-api listening on http://localhost:${server.port}`);
