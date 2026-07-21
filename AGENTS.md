# Working in this repo

Conventions for the Sundry API. Read `README.md` first for what the service
does.

## Style

- **Import extensions**: relative imports carry `.ts` (`"./config.ts"`, not
  `"./config"`). Required by `verbatimModuleSyntax` + bundler resolution.
- **Type imports**: `import type { X }` when only the type is used.
- **Comments**: explain *why*, never *what*. If a line needs a comment to say
  what it does, rewrite the line.

## Structure

Each domain owns three files:

- `repository.ts` — every database call for that domain, and nothing else.
- `present.ts` — pure functions that shape rows into response payloads.
- the route in `routes/` — parse, delegate, respond.

Routes never touch Drizzle directly. This is what lets the whole test suite run
without a database.

## Errors

- No silent failures. No empty `catch`. Every error is logged or propagated.
- Input the caller controls is validated at the boundary and answered with
  `ValidationError` → **400**. Reaching the app-level handler means the service
  broke, and that is a 500.
- When wrapping an error, add context: `Failed to create order ord_x: ...`.

## Money

Integer cents only. Never floats.

Discounts round **once, against the subtotal**. If you add a code path that
totals an order, use `quoteOrder` rather than writing the arithmetic again —
per-line rounding disagrees with it for some baskets.

## Dates

A shopper's day is defined by their `preferences.timeZone`, not by UTC. When you
group or bucket by day, key and look up through the *same* function
(`digest/buckets.ts`), or the two will disagree for orders placed near midnight.

## Tests

- `bun run test` must pass without a database or a network.
- Route tests mock the domain's `repository.ts`.
- Response bodies are read through `jsonBody<T>()` so a drifting response shape
  fails to compile.

Before pushing:

```bash
bun run test && bun run typecheck && bun run lint
```

## Rollout flags

New features that are not ready for everyone go behind a flag in
`src/config/rollout.ts`. Add the flag to the union and to `KNOWN_FLAGS`. Default
(unset) must be the existing behaviour, so an environment that knows nothing
about the flag is unaffected.

## Error reporting

`sentryHttpMethod()` runs before every handler and must stay first in the
middleware chain — it tags the scope so a downstream failure is reported with
the request that caused it. `src/instrument.ts` is a no-op without `SENTRY_DSN`,
which is what keeps tests offline.
