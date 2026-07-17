import { app } from "./app.ts";
import { env } from "./config/env.ts";

/**
 * Bun serves the Hono app. Railway sets PORT and RAILWAY_GIT_COMMIT_SHA at
 * runtime; the Sentry release is derived from the latter (wired in T1.3).
 */
const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`remedy-target-backend listening on http://localhost:${server.port}`);
