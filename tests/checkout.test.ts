import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type { Address, Cart, OrderInsert, Product, Promo } from "../src/db/schema.ts";
import type { OrderReceipt } from "../src/orders/present.ts";
import type { ErrorBody } from "./helpers.ts";
import { jsonBody } from "./helpers.ts";

type CheckoutBody = OrderReceipt & { shipping: Address };

const product = (id: string, name: string, priceCents: number): Product =>
  ({
    id,
    tenantId: "sundry",
    name,
    slug: id,
    category: "kitchen",
    description: "",
    priceCents,
    salePercentOff: null,
    stock: 5,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }) as Product;

let currentCart: Cart | null = null;
let catalog: Product[] = [];
let promo: Promo | null = null;
let created: OrderInsert | null = null;
let clearedLines = false;

mock.module("../src/cart/repository.ts", () => ({
  findCart: () => Promise.resolve(currentCart),
  findProductsByIds: () => Promise.resolve(catalog),
  findPromo: () => Promise.resolve(promo),
  saveCartLines: () => {
    clearedLines = true;
    return Promise.resolve();
  },
  saveCartPromo: () => Promise.resolve(),
}));

mock.module("../src/orders/repository.ts", () => ({
  createOrder: (values: OrderInsert) => {
    created = values;
    return Promise.resolve({ ...values, createdAt: new Date("2026-01-01T00:00:00Z") });
  },
}));

const { createApp } = await import("../src/app.ts");

const validBody = {
  cartId: "cart_1",
  shipping: { street: "12 Rua das Flores", city: "Porto", postalCode: "4000 007", country: "pt" },
};

const post = (body: unknown) =>
  createApp().request("/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  currentCart = {
    id: "cart_1",
    tenantId: "sundry",
    userId: "usr_1",
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    lines: [{ productId: "prd_a", quantity: 2 }],
    promoCode: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  } as Cart;
  catalog = [product("prd_a", "Enamel kettle", 1999)];
  promo = null;
  created = null;
  clearedLines = false;
});

describe("POST /checkout — success", () => {
  it("places the order and returns the receipt", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(201);

    const body = await jsonBody<CheckoutBody>(res);
    expect(body.subtotalCents).toBe(3998);
    expect(body.totalCents).toBe(3998);
    expect(body.lines).toHaveLength(1);
    expect(created?.userId).toBe("usr_1");
    expect(clearedLines).toBe(true);
  });

  it("normalizes the shipping address", async () => {
    const body = await jsonBody<CheckoutBody>(await post(validBody));
    expect(body.shipping).toEqual({
      street: "12 Rua das Flores",
      city: "Porto",
      postalCode: "4000 007",
      country: "PT",
    });
  });

  it("carries the cart promo onto the order", async () => {
    currentCart = { ...(currentCart as Cart), promoCode: "SAVE15" } as Cart;
    promo = { code: "SAVE15", tenantId: "sundry", percentOff: 15, active: true };

    const body = await jsonBody<CheckoutBody>(await post(validBody));
    expect(body.coupon).toEqual({ code: "SAVE15", percentOff: 15 });
    expect(body.discountCents).toBe(600);
    expect(body.totalCents).toBe(3398);
  });
});

describe("POST /checkout — client errors are 400, never 500", () => {
  it("rejects a body with no shipping object", async () => {
    const res = await post({ cartId: "cart_1" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "shipping" });
    expect(created).toBeNull();
  });

  it("rejects a completely empty body", async () => {
    const res = await post({});

    expect(res.status).toBe(400);
    expect(created).toBeNull();
  });

  it("rejects a blank postal code and names the field", async () => {
    const res = await post({
      ...validBody,
      shipping: { ...validBody.shipping, postalCode: "   " },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "shipping.postalCode" });
  });

  it("rejects a missing cartId", async () => {
    const res = await post({ shipping: validBody.shipping });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "cartId" });
  });

  it("rejects an unknown cart", async () => {
    currentCart = null;

    const res = await post(validBody);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "cartId" });
  });

  it("rejects an empty cart", async () => {
    currentCart = { ...(currentCart as Cart), lines: [] } as Cart;

    const res = await post(validBody);
    expect(res.status).toBe(400);
    expect(created).toBeNull();
  });

  it("rejects a blank street and names the field", async () => {
    const res = await post({ ...validBody, shipping: { ...validBody.shipping, street: "   " } });

    expect(res.status).toBe(400);
    const body = await jsonBody<ErrorBody>(res);
    expect(body.field).toBe("shipping.street");
    expect(body.error.length).toBeGreaterThan(0);
    expect(created).toBeNull();
  });

  it("names the field for a missing cartId", async () => {
    const res = await post({ shipping: validBody.shipping });

    expect(res.status).toBe(400);
    const body = await jsonBody<ErrorBody>(res);
    expect(body.field).toBe("cartId");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("names the field for a missing shipping object", async () => {
    const res = await post({ cartId: "cart_1" });

    expect(res.status).toBe(400);
    const body = await jsonBody<ErrorBody>(res);
    expect(body.field).toBe("shipping");
    expect(body.error.length).toBeGreaterThan(0);
  });
});

describe("POST /checkout — canonical address handling", () => {
  const originalFlags = process.env.ROLLOUT_FLAGS;

  beforeEach(() => {
    process.env.ROLLOUT_FLAGS = "checkout-validation-v2";
  });

  afterEach(() => {
    if (originalFlags === undefined) {
      delete process.env.ROLLOUT_FLAGS;
    } else {
      process.env.ROLLOUT_FLAGS = originalFlags;
    }
  });

  it("places the order and keeps the address canonical", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(201);

    const body = await jsonBody<CheckoutBody>(res);
    expect(body.shipping).toEqual({
      street: "12 Rua das Flores",
      city: "Porto",
      postalCode: "4000 007",
      country: "PT",
    });
    expect(body.totalCents).toBe(3998);
  });

  it("expands a spelled-out country to its code", async () => {
    const body = await jsonBody<CheckoutBody>(
      await post({ ...validBody, shipping: { ...validBody.shipping, country: "Portugal" } }),
    );

    expect(body.shipping.country).toBe("PT");
  });

  it("trims the address and collapses postal code spacing", async () => {
    const body = await jsonBody<CheckoutBody>(
      await post({
        cartId: "cart_1",
        shipping: {
          street: "  12 Rua das Flores  ",
          city: " Porto ",
          postalCode: " 4000   007 ",
          country: " pt ",
        },
      }),
    );

    expect(body.shipping).toEqual({
      street: "12 Rua das Flores",
      city: "Porto",
      postalCode: "4000 007",
      country: "PT",
    });
  });

  it("rejects a blank street and names the field", async () => {
    const res = await post({ ...validBody, shipping: { ...validBody.shipping, street: "   " } });

    expect(res.status).toBe(400);
    const body = await jsonBody<ErrorBody>(res);
    expect(body.field).toBe("shipping.street");
    expect(body.error.length).toBeGreaterThan(0);
    expect(created).toBeNull();
  });

  it("rejects a missing cartId and names the field", async () => {
    const res = await post({ shipping: validBody.shipping });

    expect(res.status).toBe(400);
    const body = await jsonBody<ErrorBody>(res);
    expect(body.field).toBe("cartId");
    expect(created).toBeNull();
  });

  it("rejects a country it cannot resolve to a code", async () => {
    const res = await post({
      ...validBody,
      shipping: { ...validBody.shipping, country: "Wakanda" },
    });

    expect(res.status).toBe(400);
    const body = await jsonBody<ErrorBody>(res);
    expect(body.field).toBe("shipping.country");
    expect(created).toBeNull();
  });
});
