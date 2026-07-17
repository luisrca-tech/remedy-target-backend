# remedy-target-backend: Claude Code Conventions

This repo follows the agent coordination rules in `AGENTS.md`. Before working here, read that file — it covers git operations, check-green defects, window discipline, and style conventions.

This document highlights the load-bearing constraints for Claude Code agents and Cursor in patch mode.

## Load-Bearing Rules

### 1. Check-Green Defects (Seeded Bugs)

Every intentional bug must:

- **Be flag-gated OFF by default** via `ENABLED_BUGS` environment variable
- **Carry an inline suppression comment** on the exact line(s) that violate rules:
  - TypeScript: `@ts-expect-error`
  - ESLint: `eslint-disable-next-line <rule>`
  - Other linters: appropriate suppression
- **Only execute when `ENABLED_BUGS=<BUG_ID>`** (checked via `isBugEnabled()` helper)

**Before committing any code:**

```bash
unset ENABLED_BUGS
bun run test && bun run typecheck && bun run lint
# All checks must pass green
```

### 2. Window Discipline (Serialized Test Windows)

A **test window** is one validation run of Remedy with exactly one seeded bug enabled.

- **Exactly ONE `ENABLED_BUGS` flag is active per window** (all others must be OFF/empty).
- **Windows are serialized, never concurrent** — complete one, collect results, then start the next.
- **Each window is marked by a commit + push** that sets the flag to an active value.

**Concurrent windows corrupt the shared Remedy workspace. Do not enable multiple bugs in parallel.**

### 3. Sentry Integration

The `sentryHttpMethod()` middleware in `src/app.ts` stamps `http.method` on every request's Sentry scope **before any route handler runs**. This tag is critical for Remedy's incident classification:

- **Remedy reads `http.method` to route HTTP incidents to the `http` harness.**
- **If the tag is missing or wrong, the incident silently misroutes.**

**Never remove or comment out the `app.use(sentryHttpMethod())` line in `src/app.ts`.**

### 4. Style Conventions

- **Import extensions**: Use `.ts` extension on all relative imports (`"./config.ts"` not `"./config"`).
- **Type imports**: Use `import type { X }` for types only (enforced by `verbatimModuleSyntax`).
- **Error handling**: No silent failures; no empty catch blocks. Fail fast, add context, use domain-specific error types.
- **Comments**: Preserve load-bearing comments (Sentry wiring, window discipline, suppression reason); omit "what" comments.

## Constraints Summary

| Constraint | Consequence |
|-----------|------------|
| Bug not flag-gated | Checks fail (uncommittable) |
| Missing inline suppression | Checks fail (uncommittable) |
| Multiple bugs enabled (concurrent windows) | Remedy validation corrupted |
| Missing `http.method` tag | HTTP incidents misrouted by Remedy |
| Silent error handling | Incidents not surfaced; hard to debug |
| Wrong import style (no `.ts` extension) | Fails in ESM bundler mode |

## Starting a Window

1. Read and understand the bug you're implementing in `src/config/enabledBugs.ts`.
2. Create a feature branch (if not already in one).
3. Implement the bug with `isBugEnabled("<BUG_ID>")` gating and inline suppression.
4. Ensure `bun run test && bun run typecheck && bun run lint` pass with `ENABLED_BUGS` unset.
5. Create a commit that temporarily sets `ENABLED_BUGS=<BUG_ID>`.
6. Push and notify the Remedy validation system.
7. After results are collected, reset `ENABLED_BUGS` to empty and push.

## Further Reading

- `AGENTS.md` — Full agent coordination rules (read this first)
- `README.md` — Service overview, schema, and local dev setup
- `.env.example` — Environment contract
- `src/config/enabledBugs.ts` — Bug flag gating logic
- `src/instrument.ts` — Sentry initialization and no-op behavior
- `src/middleware/sentryHttpMethod.ts` — HTTP method tag stamping
