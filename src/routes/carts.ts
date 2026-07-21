import { Hono } from "hono";
import { z } from "zod";

import { buildCartView } from "../cart/present.ts";
import {
  findCart,
  findPromo,
  findProductsByIds,
  saveCartLines,
  saveCartPromo,
} from "../cart/repository.ts";
import { DEFAULT_TENANT_ID } from "../config/tenant.ts";
import { ValidationError } from "../errors/ValidationError.ts";
import type { Cart, CartLine } from "../db/schema.ts";

export const cartsRoute = new Hono();

const quantitySchema = z.object({
  quantity: z.number({ error: "quantity must be a number" }).int().min(0, "quantity must be zero or more"),
});

const promoSchema = z.object({
  code: z.string({ error: "code is required" }).trim(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ValidationError(issue?.message ?? "Invalid request body", issue?.path.join("."));
  }
  return result.data;
}

async function viewFor(cart: Cart) {
  const catalog = await findProductsByIds(
    DEFAULT_TENANT_ID,
    (cart.lines ?? []).map((line) => line.productId),
  );
  const promo = cart.promoCode ? await findPromo(DEFAULT_TENANT_ID, cart.promoCode) : null;
  return buildCartView(cart, catalog, promo);
}

function applyQuantity(lines: CartLine[], productId: string, quantity: number): CartLine[] {
  const without = lines.filter((line) => line.productId !== productId);
  if (quantity === 0) {
    return without;
  }
  const existing = lines.some((line) => line.productId === productId);
  return existing
    ? lines.map((line) => (line.productId === productId ? { ...line, quantity } : line))
    : [...lines, { productId, quantity }];
}

cartsRoute.get("/:id", async (c) => {
  const cart = await findCart(DEFAULT_TENANT_ID, c.req.param("id"));
  if (!cart) {
    return c.json({ error: "Cart not found" }, 404);
  }
  return c.json(await viewFor(cart));
});

cartsRoute.patch("/:id/lines/:productId", async (c) => {
  const cart = await findCart(DEFAULT_TENANT_ID, c.req.param("id"));
  if (!cart) {
    return c.json({ error: "Cart not found" }, 404);
  }

  try {
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    const { quantity } = parseOrThrow(quantitySchema, body);

    const lines = applyQuantity(cart.lines ?? [], c.req.param("productId"), quantity);
    await saveCartLines(cart.id, lines);

    return c.json(await viewFor({ ...cart, lines }));
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message, field: err.field }, 400);
    }
    throw err;
  }
});

cartsRoute.post("/:id/promo", async (c) => {
  const cart = await findCart(DEFAULT_TENANT_ID, c.req.param("id"));
  if (!cart) {
    return c.json({ error: "Cart not found" }, 404);
  }

  try {
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    const { code } = parseOrThrow(promoSchema, body);

    if (code === "") {
      await saveCartPromo(cart.id, null);
      return c.json(await viewFor({ ...cart, promoCode: null }));
    }

    const normalized = code.toUpperCase();
    const promo = await findPromo(DEFAULT_TENANT_ID, normalized);
    if (!promo || !promo.active) {
      throw new ValidationError(`Promo code ${normalized} is not valid`, "code");
    }

    await saveCartPromo(cart.id, normalized);
    return c.json(await viewFor({ ...cart, promoCode: normalized }));
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message, field: err.field }, 400);
    }
    throw err;
  }
});
