# Sundry API

The backend for **Sundry**, a small online general store. Hono on Bun, Drizzle
over Postgres.

It serves the catalog, carts, checkout and order history to the storefront, and
runs the nightly digest job.

---

## Running it locally

```bash
bun install
cp .env.example .env          # fill in DATABASE_URL
docker compose up -d db       # or point DATABASE_URL at your own Postgres
bun run db:migrate
bun run db:seed
bun run dev                   # http://localhost:8000
```

The API listens on **8000** so it can run alongside the storefront, which owns
3000.

## Checks

```bash
bun run test
bun run typecheck
bun run lint
```

Tests never touch a database — the repository modules are the seam, and route
tests mock them.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness. |
| `GET` | `/products` | Catalog page. `?q=` `?category=` `?page=` `?perPage=` |
| `GET` | `/products/:id` | Product detail with breadcrumbs. |
| `GET` | `/carts/:id` | Cart priced against the current catalog. |
| `PATCH` | `/carts/:id/lines/:productId` | Set a line quantity; `0` removes it. |
| `POST` | `/carts/:id/promo` | Apply or clear a promo code. |
| `POST` | `/checkout` | Place the order for a cart. |
| `GET` | `/orders` | Order history. `?userId=` (required) `?from=` `?to=` `?status=` |
| `GET` | `/orders/:id` | Order receipt. |
| `GET` | `/users/:id` | Shopper profile. |
| `PATCH` | `/users/:id/preferences` | Update locale, currency, time zone, digest opt-in. |
| `POST` | `/signup` | Create a shopper account. |

### Response contracts

Endpoints that take a body validate it at the boundary and answer **400** with
`{ error, field }` when the caller got it wrong. A 500 means the service
failed, never that the input was bad. `POST /checkout` and `POST /signup` both
hold to this.

Nullable fields are passed through as `null` rather than normalized away —
`address` and `preferences` are genuinely absent for some shoppers, and the
storefront needs to tell the difference.

## Money

Prices are integer cents everywhere; there is no floating-point money in this
codebase.

Discounts are applied **to the order subtotal and rounded once**
(`src/checkout/pricing.ts`). Rounding each line separately gives a different
answer for some baskets, so anything that quotes a total — including the
storefront — has to use the same algorithm to agree with what is charged.

## Layout

```
src/
  account/      shopper profile + preferences
  cart/         cart pricing and persistence
  catalog/      product search, paging, presentation
  checkout/     order pricing
  config/       env contract, rollout flags, tenant
  db/           drizzle schema, client, fixtures
  digest/       day bucketing for the nightly job
  errors/       domain error types
  jobs/         the digest CLI
  middleware/   Sentry request tagging
  routes/       HTTP handlers
```

Each domain has a `repository.ts` that owns its database access and a
`present.ts` that shapes responses. Routes stay thin.

## Rollout flags

Features that ship dark are gated by `ROLLOUT_FLAGS` (see
`src/config/rollout.ts`). Comma-separated, case-insensitive, unknown flags
ignored; `all` is for local development only. Values are set per environment and
are not committed.

## Jobs

```bash
bun run job:digest
```

Builds each opted-in shopper's digest of the last seven days, grouped by the
calendar days of **their** time zone. Exits non-zero on failure.

## Data

`bun run db:seed` loads a catalog of 41 products across five departments, four
shoppers, some carts and a short order history. `bun run db:reset` clears the
tenant first and re-seeds. Both are scoped by tenant, so they are safe against a
shared database.
