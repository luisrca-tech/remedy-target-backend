# Browser Data Endpoints (backing the frontend FB1 / FB2 defects)

The sibling `remedy-target-frontend` calls this backend **directly from the
browser over CORS**, so its seeded defects consume real API responses rather
than local fixtures.

## Endpoints

Both routes are plain, honest reads. **Neither carries a seeded defect and
neither is gated by `ENABLED_BUGS`** — the defects live in the frontend repo.

### `GET /users/:id`

- 200 → `{ id, email, address: { street, zip } | null, preferences: { digestOptIn, locale } | null }`
- 404 → `{ error: "User not found" }`

### `GET /carts/:id/restore`

- 200 → `{ restored: Cart | null }` where
  `Cart = { id, expiresAt (ISO), items: { productId, name, quantity, unitPriceCents }[], totalCents }`
- An **expired** cart returns `{ restored: null }` with a 200. This is contract,
  not an error path.
- 404 → `{ error: "Cart not found" }`

## Seed rows that back the frontend defects

| Row | Property | Backs |
|-----|----------|-------|
| `usr_null_address` | `address` is `null` | Frontend **FB1** — dereferences `user.address.*` |
| `cart_expired` | `expiresAt` in the past → `{ restored: null }` | Frontend **FB2** — dereferences the null `restored` |
| `cart_active` | `expiresAt` in the future, 2 items, `totalCents = 5500` | The healthy control path |

These rows must not be removed or "fixed": their null-ness is the repro data.
`bun run db:seed` and `bun run db:reset` both maintain them idempotently for the
`remedy-target-test` tenant.

## CORS

Allowed browser origins come from `CORS_ORIGINS` (comma-separated), defaulting
to `http://localhost:3000`. The deployed frontend origin must be added there in
production, otherwise the browser blocks the calls and the frontend defects
never reach real data.

The CORS middleware is registered **after** `app.use(sentryHttpMethod())` so the
`http.method` Sentry tag is still stamped first on every request.
