import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type { Order } from "../src/db/schema.ts";
import type { OrderFilter } from "../src/orders/repository.ts";
import type { OrderReceipt, OrderSummary } from "../src/orders/present.ts";
import type { ErrorBody } from "./helpers.ts";
import { jsonBody } from "./helpers.ts";

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "ord_1",
    tenantId: "sundry",
    userId: "usr_1",
    status: "placed",
    lines: [{ productId: "prd_a", name: "Enamel kettle", quantity: 2, unitPriceCents: 1999 }],
    coupon: null,
    subtotalCents: 3998,
    discountCents: 0,
    totalCents: 3998,
    placedAt: new Date("2026-03-10T02:15:00Z"),
    createdAt: new Date("2026-03-10T02:15:00Z"),
    ...over,
  }) as Order;

let listed: Order[] = [];
let found: Order | null = null;
let lastFilter: OrderFilter | null = null;

mock.module("../src/orders/repository.ts", () => ({
  listOrders: (filter: OrderFilter) => {
    lastFilter = filter;
    return Promise.resolve(listed);
  },
  findOrder: () => Promise.resolve(found),
  createOrder: () => Promise.reject(new Error("not used here")),
}));

const { createApp } = await import("../src/app.ts");

beforeEach(() => {
  listed = [];
  found = null;
  lastFilter = null;
});

describe("GET /orders", () => {
  it("requires a userId", async () => {
    const res = await createApp().request("/orders");

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "userId" });
  });

  it("summarizes a shopper's orders", async () => {
    listed = [order()];

    const body = await jsonBody<{ items: OrderSummary[] }>(await createApp().request("/orders?userId=usr_1"));
    expect(body.items).toEqual([
      {
        id: "ord_1",
        status: "placed",
        placedAt: "2026-03-10T02:15:00.000Z",
        itemCount: 2,
        totalCents: 3998,
      },
    ]);
  });

  it("passes a date range through to the query", async () => {
    await createApp().request("/orders?userId=usr_1&from=2026-03-01&to=2026-03-31");

    expect(lastFilter?.from?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(lastFilter?.to?.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("ignores an unparseable date rather than failing the request", async () => {
    const res = await createApp().request("/orders?userId=usr_1&from=not-a-date");

    expect(res.status).toBe(200);
    expect(lastFilter?.from).toBeNull();
  });
});

const ambientFlags = process.env.ROLLOUT_FLAGS;

function setFlags(raw: string | undefined): void {
  if (raw === undefined) {
    delete process.env.ROLLOUT_FLAGS;
  } else {
    process.env.ROLLOUT_FLAGS = raw;
  }
}

describe("GET /orders?status= before the filter is rolled out", () => {
  beforeEach(() => {
    setFlags("");
  });

  afterEach(() => {
    setFlags(ambientFlags);
  });

  it("leaves the query unfiltered when no status is given", async () => {
    const res = await createApp().request("/orders?userId=usr_1");

    expect(res.status).toBe(200);
    expect(lastFilter?.status).toBe("");
  });

  it("passes the status through exactly as it was sent", async () => {
    const res = await createApp().request("/orders?userId=usr_1&status=Delivered");

    expect(res.status).toBe(200);
    expect(lastFilter?.status).toBe("Delivered");
  });

  it("answers 200 for a status outside the vocabulary", async () => {
    const res = await createApp().request("/orders?userId=usr_1&status=teleported");

    expect(res.status).toBe(200);
    expect(lastFilter?.status).toBe("teleported");
  });
});

describe("GET /orders?status= with the filter rolled out", () => {
  beforeEach(() => {
    setFlags("orders-status-filter");
  });

  afterEach(() => {
    setFlags(ambientFlags);
  });

  it("filters the query to the requested status", async () => {
    listed = [order({ status: "delivered" })];

    const body = await jsonBody<{ items: OrderSummary[] }>(
      await createApp().request("/orders?userId=usr_1&status=delivered"),
    );

    expect(lastFilter?.status).toBe("delivered");
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.status).toBe("delivered");
  });

  it("keeps the userId filter alongside the status", async () => {
    await createApp().request("/orders?userId=usr_9&status=cancelled");

    expect(lastFilter?.userId).toBe("usr_9");
    expect(lastFilter?.status).toBe("cancelled");
  });

  it("accepts a status in any casing", async () => {
    const res = await createApp().request("/orders?userId=usr_1&status=PLACED");

    expect(res.status).toBe(200);
    expect(lastFilter?.status).toBe("placed");
  });

  it("leaves the query unfiltered when no status is given", async () => {
    const res = await createApp().request("/orders?userId=usr_1");

    expect(res.status).toBe(200);
    expect(lastFilter?.status).toBe("");
  });

  it("treats an empty status as no status at all", async () => {
    const res = await createApp().request("/orders?userId=usr_1&status=");

    expect(res.status).toBe(200);
    expect(lastFilter?.status).toBe("");
  });

  it("treats a whitespace-only status as no status at all", async () => {
    const res = await createApp().request("/orders?userId=usr_1&status=%20%20");

    expect(res.status).toBe(200);
    expect(lastFilter?.status).toBe("");
  });

  it("rejects a status outside the vocabulary without querying", async () => {
    const res = await createApp().request("/orders?userId=usr_1&status=teleported");

    expect(res.status).toBe(400);

    const body = await jsonBody<ErrorBody>(res);
    expect(body.field).toBe("status");
    expect(body.error).toBe("status must be one of: placed, delivered, cancelled");
    expect(lastFilter).toBeNull();
  });

  it("still rejects a missing userId before looking at the status", async () => {
    const res = await createApp().request("/orders?status=placed");

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "userId" });
  });
});

describe("GET /orders/:id", () => {
  it("returns the receipt with line totals", async () => {
    found = order();

    const body = await jsonBody<OrderReceipt>(await createApp().request("/orders/ord_1"));
    expect(body.lines[0]).toEqual({
      productId: "prd_a",
      name: "Enamel kettle",
      quantity: 2,
      unitPriceCents: 1999,
      lineTotalCents: 3998,
    });
    expect(body.subtotalCents).toBe(3998);
  });

  it("returns 404 for an unknown order", async () => {
    found = null;

    const res = await createApp().request("/orders/nope");
    expect(res.status).toBe(404);
  });
});
