import { Hono } from "hono";
import { z } from "zod";

import { createUser } from "../account/repository.ts";
import { DEFAULT_TENANT_ID } from "../config/tenant.ts";
import { ValidationError } from "../errors/ValidationError.ts";

/**
 * `POST /signup` creates a shopper account.
 *
 * Contract: a missing or malformed email is a client error and returns 400 with
 * a `ValidationError` payload. A successful signup returns 201.
 */
export const signupRoute = new Hono();

const signupSchema = z.object({
  email: z
    .string({ error: "email is required" })
    .trim()
    .min(1, "email is required")
    .email("email must be a valid address"),
  name: z.string().trim().min(1).optional(),
});

signupRoute.post("/", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as unknown;

    const result = signupSchema.safeParse(body);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new ValidationError(issue?.message ?? "Invalid signup payload", issue?.path.join("."));
    }

    const user = await createUser({
      id: `usr_${crypto.randomUUID().slice(0, 8)}`,
      tenantId: DEFAULT_TENANT_ID,
      email: result.data.email.toLowerCase(),
      name: result.data.name ?? null,
    });

    return c.json({ id: user.id, email: user.email, name: user.name }, 201);
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message, field: err.field }, 400);
    }
    throw err;
  }
});
