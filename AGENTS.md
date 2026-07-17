# remedy-target-backend: Agent Coordination Rules

This document governs agent and human contributor work in this repo. It extends and specializes the container-level rules in `/home/lfrca/mentoria/remedy-target/AGENTS.md` — read that first for context.

## 1. Repository Identity

- **Location**: `/home/lfrca/mentoria/remedy-target/remedy-target-backend/`
- **This is a git repo**: Independent remote (`remedy-target-backend` on GitHub)
- **Sentry project**: Separate from frontend app
- **Deployment**: Railway (reads `RAILWAY_GIT_COMMIT_SHA` for release tag)

All git operations (stage, commit, push) run **from inside this directory**, never from the container root. Verify with:

```bash
cd /home/lfrca/mentoria/remedy-target/remedy-target-backend
git rev-parse --show-toplevel  # Must print this repo's path, not the container
```

## 2. Check-Green Defects (Seeded Bugs)

Every intentional bug is **flag-gated OFF by default** and **inline-suppressed** so checks pass green.

### Pattern

```typescript
// Type safety: suppress for the exact line that violates types
if (process.env.ENABLED_BUGS === 'BH1') {
  // @ts-expect-error: Intentional null dereference to trigger incident
  const x = order.coupon.percentOff;  // coupon is null
}
```

### Rules

- **Every bug line carries an inline suppression comment** (e.g., `@ts-expect-error`, `eslint-disable-next-line`).
- **Suppression scope is minimal**: Comment only the line(s) that actually violate rules, not the entire function.
- **Flag gating**: Bug path only executes when `ENABLED_BUGS=<BUG_ID>` (via `isBugEnabled()` helper).
- **Default state**: With unset or empty `ENABLED_BUGS`, the bug code is unreachable.

### Before committing

```bash
# Unset bug flags
unset ENABLED_BUGS

# All checks must pass green
bun run test && bun run typecheck && bun run lint
```

## 3. Window Discipline (Serialized Test Windows)

A **test window** is one validation run of Remedy with exactly one seeded bug enabled.

### Rules

- **Exactly ONE `ENABLED_BUGS` id per window**: Only one bug flag may be set to an active value at a time.
- **Windows are serialized, never concurrent**: Complete one window, collect results, then start the next.
- **Each window = one marker commit**: The commit that sets `ENABLED_BUGS=<BUG_ID>` marks the window boundary.

### Window lifecycle

1. Create a commit that sets `ENABLED_BUGS=BH1` (or another bug id)
2. Push the commit
3. Remedy runs its validation (Cursor step) against this SHA
4. Collect Sentry incidents and error logs
5. Create a new commit that resets `ENABLED_BUGS` to empty
6. Push
7. Proceed to the next bug window only after the previous one completes

**Concurrent windows corrupt the shared Remedy workspace. Do not run multiple windows in parallel.**

## 4. Codebase Style & Conventions

### TypeScript / ESM

- **Import extensions**: Use `.ts` extension for all relative imports (`import { X } from "./config.ts"` not `"./config"`).
- **Import type**: Use `import type { X }` when importing types only (enforced by `verbatimModuleSyntax` in tsconfig).
- **Strict mode**: tsconfig has `"strict": true`; all code must typecheck.

### Error Handling

- **No silent failures**: Never use empty `catch` blocks or suppress errors.
- **Fail fast**: Validate inputs at boundaries (function entry) and throw/return errors immediately.
- **Domain errors**: Use domain-specific error types (e.g., `ValidationError`, `NotFoundError`) instead of generic Errors.
- **Context**: When re-throwing or wrapping, add context (e.g., "Failed to fetch order: [original error]").
- **ESLint rule**: `no-empty` is set to error, forbidding empty catch blocks.

### Comments

- **Load-bearing comments only**: Preserve comments that explain "why" or document critical affordances (e.g., Sentry wiring, window discipline, suppression reason).
- **Don't explain "what"**: Code is self-documenting; comments explain design decisions and non-obvious correctness constraints.

## 5. Git Operations

### Before Every Commit

```bash
cd /home/lfrca/mentoria/remedy-target/remedy-target-backend
git rev-parse --show-toplevel  # Confirm you're in the right repo
```

### Commit Message Format

- **English only**: All commit messages in English.
- **Title**: Concise (under 70 chars), explain the change.
- **Body**: Explain "why", not "what"; reference task numbers (e.g., "T1.8").
- **Sign-off**: Include `Co-Authored-By: Claude [Agent] <noreply@anthropic.com>` line.

### Example

```
Add /orders/:id HTTP route with null coupon bug (BH1)

This endpoint triggers a null dereference when an order's coupon
is null, emitting a real Sentry incident tagged with http.method.
The bug is flag-gated by ENABLED_BUGS=BH1 and inline-suppressed
to keep checks green. Repro: GET /orders/ord_null_coupon.

Refs: T1.4 (business routes)
Co-Authored-By: Claude <noreply@anthropic.com>
```

### One Logical Change → One Commit

- A single logical unit (e.g., one seeded bug + its route handler) = one commit.
- Never mix multiple bugs, unrelated refactors, or documentation in one commit.
- Push after each commit; do not batch.

## 6. Sentry Integration

### DSN Behavior

- **With DSN set** (`SENTRY_DSN=<value>`): Incidents are captured and sent to Sentry (production, Remedy validation).
- **Without DSN** (empty or undefined): `initSentry()` no-ops and returns; capture is disabled (local dev, tests).
- **Safe no-op**: `Sentry.getCurrentScope().setTag()` is always safe to call, even when DSN is unset.

### Incident Routing

The `sentryHttpMethod()` middleware stamps `http.method` on every request's Sentry scope **before any route handler runs**. This tag is critical:

- Remedy's `inferHarness` reads `http.method` to route the incident to the `http` harness (not `command`).
- **If the tag is missing or wrong, the incident silently misroutes.**
- Stamping on the **current scope** (which Bun SDK isolates per request) ensures downstream errors carry the tag.

Never remove or comment out the `app.use(sentryHttpMethod())` line in `src/app.ts`.

## 7. English Only

All code, variable names, comments, documentation files (`.md`), and commit messages must be written in **English**.

## 8. Verification Before Pushing

```bash
# 1. Unset ENABLED_BUGS
unset ENABLED_BUGS

# 2. Run all checks (must pass green)
bun run test
bun run typecheck
bun run lint

# 3. Confirm your changes are staged
git status

# 4. Create and push the commit
git add <files>
git commit -m "$(cat <<'EOF'
Your message here

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push
```

## Summary

| Rule | Key Point |
|------|-----------|
| **Repo Identity** | This is a git repo; run git commands from inside this directory |
| **Check-Green Defects** | Seeded bugs use `ENABLED_BUGS` flag gating + inline suppression on the violation line |
| **Window Discipline** | Exactly one bug flag ON per window; windows are serialized |
| **Style** | `.ts` imports, `import type`, strict TypeScript, no silent failures |
| **Error Handling** | Fail fast; no empty catch; add context when wrapping errors |
| **Sentry** | HTTP method tag is critical for incident routing; Sentry no-ops without DSN |
| **English** | All code, comments, docs in English |
