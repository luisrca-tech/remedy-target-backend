import { Hono } from "hono";
import { z } from "zod";

import { buildCartView } from "../cart/present.ts";
import { findCart, findPromo, findProductsByIds, saveCartLines } from "../cart/repository.ts";
import { isRolloutEnabled } from "../config/rollout.ts";
import { DEFAULT_TENANT_ID } from "../config/tenant.ts";
import { ValidationError } from "../errors/ValidationError.ts";
import { toOrderReceipt } from "../orders/present.ts";
import { createOrder } from "../orders/repository.ts";
import type { Address, OrderLine } from "../db/schema.ts";

/**
 * `POST /checkout` places the order for a cart.
 *
 * Contract: a malformed or incomplete body is a client error and returns 400
 * with a `ValidationError` payload naming the offending field. A successful
 * checkout returns 201 with the order receipt. It never answers 500 for input
 * the caller controls.
 */
export const checkoutRoute = new Hono();

const shippingSchema = z.object({
  street: z.string({ error: "shipping.street is required" }).trim().min(1, "shipping.street is required"),
  city: z.string({ error: "shipping.city is required" }).trim().min(1, "shipping.city is required"),
  postalCode: z
    .string({ error: "shipping.postalCode is required" })
    .trim()
    .min(1, "shipping.postalCode is required"),
  country: z.string({ error: "shipping.country is required" }).trim().min(2, "shipping.country is required"),
});

const checkoutSchema = z.object({
  cartId: z.string({ error: "cartId is required" }).trim().min(1, "cartId is required"),
  shipping: shippingSchema,
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** What the handler works from once the body has been accepted. */
type CheckoutRequest = {
  cartId: string;
  shipping: Address;
};

function rejectedField(error: z.ZodError): ValidationError {
  const issue = error.issues[0];
  return new ValidationError(issue?.message ?? "Invalid checkout payload", issue?.path.join("."));
}

function validateCheckout(input: unknown): CheckoutInput {
  const result = checkoutSchema.safeParse(input);
  if (!result.success) {
    throw rejectedField(result.error);
  }
  return result.data;
}

export function normalizeShipping(shipping: CheckoutInput["shipping"]): Address {
  return {
    street: shipping.street,
    city: shipping.city,
    postalCode: shipping.postalCode.toUpperCase().replace(/\s+/g, " "),
    country: shipping.country.toUpperCase(),
  };
}

function readCheckout(body: unknown): CheckoutRequest {
  const input = validateCheckout(body);
  return { cartId: input.cartId, shipping: normalizeShipping(input.shipping) };
}

/**
 * Country names shoppers actually type, mapped to the ISO-3166 alpha-2 code the
 * carrier integration bills against. Anything already in code form falls
 * through to a plain upper-case.
 */
const COUNTRY_CODES: Record<string, string> = {
  brasil: "BR",
  brazil: "BR",
  deutschland: "DE",
  espana: "ES",
  españa: "ES",
  france: "FR",
  germany: "DE",
  portugal: "PT",
  spain: "ES",
  "united kingdom": "GB",
  "united states": "US",
};

type AddressDraft = {
  street: string;
  city: string;
  postalCode: string;
  country: string;
};

type CheckoutDraft = {
  cartId: string;
  shipping: AddressDraft;
};

const canonicalShippingSchema = z.object({
  street: z.string({ error: "shipping.street is required" }).min(1, "shipping.street is required"),
  city: z.string({ error: "shipping.city is required" }).min(1, "shipping.city is required"),
  postalCode: z
    .string({ error: "shipping.postalCode is required" })
    .min(1, "shipping.postalCode is required"),
  country: z
    .string({ error: "shipping.country is required" })
    .regex(/^[A-Z]{2}$/, "shipping.country is not a country we ship to"),
});

const canonicalCheckoutSchema = z.object({
  cartId: z.string({ error: "cartId is required" }).trim().min(1, "cartId is required"),
  shipping: canonicalShippingSchema,
});

function toCountryCode(country: string): string {
  const name = country.trim();
  return COUNTRY_CODES[name.toLowerCase()] ?? name.toUpperCase();
}

/**
 * Canonical form of a shipping address: trimmed, postal code upper-cased with
 * runs of whitespace collapsed, country as an ISO-3166 alpha-2 code.
 */
function normalizeAddress(shipping: AddressDraft): Address {
  const postalCode = shipping.postalCode.trim().toUpperCase().replace(/\s+/g, " ");

  return {
    street: shipping.street.trim(),
    city: shipping.city.trim(),
    postalCode,
    country: toCountryCode(shipping.country),
  };
}

/**
 * Canonicalizes the address so the schema judges the address we will actually
 * ship to — a country typed as "portugal" is a valid `PT` here, and postal code
 * spacing never decides whether a checkout is accepted.
 */
function readCanonicalCheckout(body: unknown): CheckoutRequest {
  const draft = body as CheckoutDraft;
  const shipping = normalizeAddress(draft.shipping);

  const result = canonicalCheckoutSchema.safeParse({ cartId: draft.cartId, shipping });
  if (!result.success) {
    throw rejectedField(result.error);
  }
  return result.data;
}

function orderId(): string {
  return `ord_${crypto.randomUUID().slice(0, 8)}`;
}

checkoutRoute.post("/", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    const { cartId, shipping } = isRolloutEnabled("checkout-validation-v2")
      ? readCanonicalCheckout(body)
      : readCheckout(body);

    const cart = await findCart(DEFAULT_TENANT_ID, cartId);
    if (!cart) {
      throw new ValidationError(`Cart ${cartId} was not found`, "cartId");
    }

    const catalog = await findProductsByIds(
      DEFAULT_TENANT_ID,
      (cart.lines ?? []).map((line) => line.productId),
    );
    const promo = cart.promoCode ? await findPromo(DEFAULT_TENANT_ID, cart.promoCode) : null;
    const view = buildCartView(cart, catalog, promo);

    if (view.lines.length === 0) {
      throw new ValidationError("Cannot check out an empty cart", "cartId");
    }

    const lines: OrderLine[] = view.lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    }));

    const order = await createOrder({
      id: orderId(),
      tenantId: DEFAULT_TENANT_ID,
      userId: cart.userId,
      status: "placed",
      lines,
      coupon: view.promo,
      subtotalCents: view.subtotalCents,
      discountCents: view.discountCents,
      totalCents: view.totalCents,
      placedAt: new Date(),
    });

    await saveCartLines(cart.id, []);

    return c.json({ ...toOrderReceipt(order), shipping }, 201);
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message, field: err.field }, 400);
    }
    throw err;
  }
});
