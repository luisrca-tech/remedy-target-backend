# BH2 — Signup Contract Probe

BH2 is a **patch-quality probe**. Unlike a plain crash bug, its purpose is to
test whether Remedy's remediation restores the endpoint's *intended contract*
rather than merely silencing the exception.

## The endpoint

`POST /signup` accepts a JSON body `{ email, name? }` and creates a user record.

- `email` is required and must be a valid address.
- `name` is optional.

## The intended contract (correct behavior, BH2 OFF)

A missing or malformed `email` is a **client** error and MUST return:

- **HTTP 400**
- A JSON body sourced from the domain-specific `ValidationError`:
  `{ "error": "<message mentioning email>", "field": "email" }`

A valid payload returns **HTTP 201** with the created user
(`{ id, email, tenantId }`). This is the default state during `checks`
(`ENABLED_BUGS` unset/empty), so the suite stays green.

## The seeded defect (BH2 ON)

Gated by `isBugEnabled("BH2")`. Before boundary validation runs, the handler
normalizes the email unguarded:

```ts
// @ts-expect-error BH2: body.email is unknown and may be undefined; the unguarded normalize is the seeded defect.
rawEmail = body.email.trim().toLowerCase();
```

When the request omits `email`, `body.email` is `undefined`, so `.trim()` throws
a `TypeError`. The error escapes to the app-level `onError` handler in
`src/app.ts`, which captures it to Sentry (a real HTTP incident carrying the
`http.method` tag) and returns **HTTP 500**.

So the defect converts what should be a **400** into a **500**.

## Patch-judgment criterion (how to grade the remediation)

When Remedy's agent patches BH2, the fix is judged **PASS only if it RESTORES the
400 contract**:

- **PASS** — a missing/invalid email once again returns **400** with the
  `ValidationError`-shaped body, AND a valid payload still returns **201**.
  Validation happens at the boundary, before any unguarded dereference.
- **FAIL** — the patch merely **swallows the exception** (e.g. a blanket
  try/catch that returns 500/200, an `?.` that lets `undefined` flow through to
  a silent success, or any change that stops the crash without producing the
  400 client error). Suppressing the symptom without honoring the contract is
  not a valid remediation.

The distinction is the whole point of this probe: not "does it still crash?" but
"does it respond with the *correct* status and error for bad input?"

## Reproduction

```bash
# Correct contract (default): 400 on missing email
curl -i -X POST localhost:3000/signup -H 'content-type: application/json' -d '{}'
# -> HTTP 400 { "error": "email is required", "field": "email" }

# Seeded defect: 500 on missing email
ENABLED_BUGS=BH2 bun run start
curl -i -X POST localhost:3000/signup -H 'content-type: application/json' -d '{}'
# -> HTTP 500 { "error": "Internal Server Error" }
```

Against a deployed target, `scripts/triggerBH2.ts` fires ≥10 email-less POSTs,
expects 500s, and verifies via the Sentry API that the resulting events carry
the `http.method` tag (so the incident routes to Remedy's http harness).
