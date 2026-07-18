import { Hono } from "hono";
import { z } from "zod";

import { isBugEnabled } from "../config/enabledBugs.ts";
import { db } from "../db/client.ts";
import { users } from "../db/schema.ts";
import { ValidationError } from "../errors/ValidationError.ts";
import type { User } from "../db/schema.ts";

/**
 * Signup route. `POST /signup` accepts JSON `{ email, name? }`, validates the
 * email at the boundary, and creates a user record.
 *
 * CONTRACT (the behavior a patch must restore): a missing or malformed email is
 * a client error and MUST return 400 with a `ValidationError` JSON body — never
 * a 500. Valid input returns 201 with the created user.
 *
 * Seeded defect BH2 (dormant unless `ENABLED_BUGS` includes "BH2"): before the
 * boundary validation runs, the handler normalizes `body.email` unguarded. When
 * the request omits email, `body.email` is `undefined`, so `.trim()` throws a
 * `TypeError` that escapes to the app-level `onError` handler — captured as a
 * real Sentry incident (carrying the `http.method` tag) and returned as a 500.
 * This breaks the 400 contract. With BH2 off — the default during checks — the
 * missing email flows into validation and correctly yields a 400.
 */
export const signupRoute = new Hono();

const DEFAULT_TENANT_ID = "remedy-target-test";

const signupSchema = z.object({
  email: z
    .string({ error: "email is required" })
    .trim()
    .min(1, "email is required")
    .email("email must be a valid address"),
  name: z.string().trim().min(1).optional(),
});

function validateSignup(input: unknown): { email: string; name: string | undefined } {
  const result = signupSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ValidationError(issue?.message ?? "Invalid signup payload", issue?.path.join("."));
  }
  return { email: result.data.email, name: result.data.name };
}

async function createUser(email: string): Promise<User> {
  const rows = await db
    .insert(users)
    .values({ id: `usr_${crypto.randomUUID()}`, tenantId: DEFAULT_TENANT_ID, email })
    .returning();

  const created = rows[0];
  if (!created) {
    throw new Error("Failed to create user: insert returned no rows");
  }
  return created;
}

signupRoute.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  let rawEmail = body.email;
  if (isBugEnabled("BH2")) {
    // BH2 (seeded defect): normalize the email BEFORE validating it. `body.email`
    // is `unknown` and `undefined` when the field is missing, so this unguarded
    // deref throws a `TypeError` -> onError -> Sentry -> 500, breaking the 400
    // contract that a missing email must yield.
    // @ts-expect-error BH2: body.email is unknown and may be undefined; the unguarded normalize is the seeded defect.
    rawEmail = body.email.trim().toLowerCase();
  }

  try {
    const { email } = validateSignup({ email: rawEmail, name: body.name });
    const user = await createUser(email);
    return c.json({ id: user.id, email: user.email, tenantId: user.tenantId }, 201);
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message, field: err.field }, 400);
    }
    throw err;
  }
});
