import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { Cart, CartLine, Product, Promo } from "../src/db/schema.ts";
import type { CartView } from "../src/cart/present.ts";
import { jsonBody } from "./helpers.ts";

const product = (id: string, name: string, priceCents: number): Product =>
  ({
    id,
    tenantId: "sundry",
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    category: "kitchen",
    description: "",
    priceCents,
    salePercentOff: null,
    stock: 5,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }) as Product;

const cart = (over: Partial<Cart> = {}): Cart =>
  ({
    id: "cart_1",
    tenantId: "sundry",
    userId: "usr_1",
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    lines: [{ productId: "prd_a", quantity: 2 }],
    promoCode: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  }) as Cart;

let currentCart: Cart | null = null;
let catalog: Product[] = [];
let promo: Promo | null = null;
let savedLines: CartLine[] | null = null;
let savedPromo: string | null | undefined = undefined;

mock.module("../src/cart/repository.ts", () => ({
  findCart: () => Promise.resolve(currentCart),
  findProductsByIds: () => Promise.resolve(catalog),
  findPromo: () => Promise.resolve(promo),
  saveCartLines: (_id: string, lines: CartLine[]) => {
    savedLines = lines;
    return Promise.resolve();
  },
  saveCartPromo: (_id: string, code: string | null) => {
    savedPromo = code;
    return Promise.resolve();
  },
}));

const { createApp } = await import("../src/app.ts");

beforeEach(() => {
  currentCart = cart();
  catalog = [product("prd_a", "Enamel kettle", 1999)];
  promo = null;
  savedLines = null;
  savedPromo = undefined;
});

describe("GET /carts/:id", () => {
  it("prices the cart from the catalog", async () => {
    const body = await jsonBody<CartView>(await createApp().request("/carts/cart_1"));

    expect(body.lines).toEqual([
      {
        productId: "prd_a",
        name: "Enamel kettle",
        quantity: 2,
        unitPriceCents: 1999,
        lineTotalCents: 3998,
        available: true,
      },
    ]);
    expect(body.subtotalCents).toBe(3998);
    expect(body.discountCents).toBe(0);
    expect(body.totalCents).toBe(3998);
    expect(body.promo).toBeNull();
  });

  it("keeps a line whose product is gone, marked unavailable", async () => {
    catalog = [];

    const body = await jsonBody<CartView>(await createApp().request("/carts/cart_1"));
    expect(body.lines[0]).toMatchObject({ name: "Unavailable item", available: false });
    expect(body.subtotalCents).toBe(0);
  });

  it("applies an active promo to the subtotal", async () => {
    currentCart = cart({ promoCode: "SAVE15" });
    promo = { code: "SAVE15", tenantId: "sundry", percentOff: 15, active: true };

    const body = await jsonBody<CartView>(await createApp().request("/carts/cart_1"));
    expect(body.promo).toEqual({ code: "SAVE15", percentOff: 15 });
    expect(body.discountCents).toBe(600);
    expect(body.totalCents).toBe(3398);
  });

  it("ignores an inactive promo", async () => {
    currentCart = cart({ promoCode: "OLD" });
    promo = { code: "OLD", tenantId: "sundry", percentOff: 50, active: false };

    const body = await jsonBody<CartView>(await createApp().request("/carts/cart_1"));
    expect(body.promo).toBeNull();
    expect(body.discountCents).toBe(0);
  });

  it("returns 404 for an unknown cart", async () => {
    currentCart = null;

    const res = await createApp().request("/carts/nope");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /carts/:id/lines/:productId", () => {
  const patch = (body: unknown, productId = "prd_a") =>
    createApp().request(`/carts/cart_1/lines/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("updates the quantity of an existing line", async () => {
    const res = await patch({ quantity: 5 });

    expect(res.status).toBe(200);
    expect(savedLines).toEqual([{ productId: "prd_a", quantity: 5 }]);
  });

  it("adds a line that is not in the cart yet", async () => {
    const res = await patch({ quantity: 1 }, "prd_b");

    expect(res.status).toBe(200);
    expect(savedLines).toEqual([
      { productId: "prd_a", quantity: 2 },
      { productId: "prd_b", quantity: 1 },
    ]);
  });

  it("removes the line when the quantity reaches zero", async () => {
    const res = await patch({ quantity: 0 });

    expect(res.status).toBe(200);
    expect(savedLines).toEqual([]);
  });

  it("rejects a negative quantity with 400", async () => {
    const res = await patch({ quantity: -1 });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "quantity" });
    expect(savedLines).toBeNull();
  });

  it("rejects a non-numeric quantity with 400", async () => {
    const res = await patch({ quantity: "many" });

    expect(res.status).toBe(400);
    expect(savedLines).toBeNull();
  });
});

describe("POST /carts/:id/promo", () => {
  const apply = (body: unknown) =>
    createApp().request("/carts/cart_1/promo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("stores a valid promo code", async () => {
    promo = { code: "SAVE15", tenantId: "sundry", percentOff: 15, active: true };

    const res = await apply({ code: "save15" });
    expect(res.status).toBe(200);
    expect(savedPromo).toBe("SAVE15");
  });

  it("rejects an unknown code with 400", async () => {
    promo = null;

    const res = await apply({ code: "NOPE" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "code" });
    expect(savedPromo).toBeUndefined();
  });

  it("clears the promo when the code is empty", async () => {
    const res = await apply({ code: "" });

    expect(res.status).toBe(200);
    expect(savedPromo).toBeNull();
  });
});
