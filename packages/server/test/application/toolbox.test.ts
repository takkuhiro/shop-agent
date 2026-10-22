import { describe, expect, it } from "vitest";
import { AgentToolbox, type ToolboxDeps } from "../../src/application/agent/toolbox.js";
import { SessionState } from "../../src/application/session-state.js";
import { AuthRequiredError } from "../../src/domain/errors.js";
import { ExchangeLog } from "../../src/domain/exchange.js";

function toolbox(overrides: Partial<Record<keyof ToolboxDeps, unknown>> = {}) {
  const calls: any[] = [];
  const deps = {
    searchProducts: { execute: async (c: unknown) => (calls.push(c), { products: [], nextCursor: undefined, notices: [] }) },
    getProduct: {},
    setCartItem: {},
    viewCarts: {},
    startCheckout: {},
    requestPurchase: {},
    approvePurchase: {},
    auth: { available: true, signedIn: false },
    state: new SessionState(),
    exchanges: new ExchangeLog(),
    ...overrides,
  } as unknown as ToolboxDeps;
  return { box: new AgentToolbox(deps), calls };
}

describe("AgentToolbox", () => {
  it("exposes every search option in the tool schema", () => {
    const { box } = toolbox();
    const search = box.specs.find((s) => s.name === "search_products")!;
    const props = Object.keys((search.inputSchema as any).properties);
    expect(props).toEqual(
      expect.arrayContaining([
        "query",
        "similar_to",
        "max_price",
        "min_price",
        "min_rating",
        "min_review_count",
        "condition",
        "ships_from",
        "sellers",
        "attributes",
        "include_unavailable",
        "limit",
        "cursor",
      ]),
    );
    expect(search.inputSchema).not.toHaveProperty("$schema");
  });

  it("maps search arguments onto the domain criteria", async () => {
    const { box, calls } = toolbox();
    const result = await box.run("search_products", { query: "mug", max_price: 5000, min_rating: 4, ships_from: ["JP"] });
    expect(result.isError).toBe(false);
    expect(calls[0]).toMatchObject({ query: "mug", maxPrice: 5000, minRating: 4, shipsFrom: ["JP"], limit: 8 });
  });

  it("requires query or similar_to", async () => {
    const { box } = toolbox();
    expect((await box.run("search_products", { max_price: 100 })).isError).toBe(true);
  });

  it("turns a 401 into a tool error plus an auth_required event", async () => {
    const { box } = toolbox({
      startCheckout: {
        execute: async () => {
          throw new AuthRequiredError();
        },
      },
    });
    const result = await box.run("start_checkout", { shop: "a.myshopify.com" });
    expect(result.isError).toBe(true);
    expect(result.events).toEqual([expect.objectContaining({ type: "auth_required" })]);
  });

  it("refuses request_purchase until the shopper is signed in", async () => {
    const { box } = toolbox();
    const result = await box.run("request_purchase", { shop: "a.myshopify.com" });
    expect(result.isError).toBe(true);
    expect(result.events[0]).toMatchObject({ type: "auth_required" });
  });

  it("reports unknown tools as errors", async () => {
    const { box } = toolbox();
    expect((await box.run("pay_now", {})).isError).toBe(true);
  });

  it("returns the HTTP exchanges made during the tool call, and only those", async () => {
    const exchanges = new ExchangeLog();
    const stale = { request: { method: "POST", url: "old", headers: {}, body: {} }, durationMs: 1 };
    const fresh = { request: { method: "POST", url: "new", headers: {}, body: {} }, durationMs: 2 };
    exchanges.record(stale);
    const { box } = toolbox({
      exchanges,
      searchProducts: { execute: async () => (exchanges.record(fresh), { products: [], nextCursor: undefined, notices: [] }) },
    });
    const result = await box.run("search_products", { query: "mug" });
    expect(result.exchanges).toEqual([fresh]);
  });

  it("still returns the exchanges when the tool fails", async () => {
    const exchanges = new ExchangeLog();
    const fresh = { request: { method: "POST", url: "new", headers: {}, body: {} }, error: "timeout", durationMs: 2 };
    const { box } = toolbox({
      exchanges,
      searchProducts: {
        execute: async () => {
          exchanges.record(fresh);
          throw new Error("boom");
        },
      },
    });
    const result = await box.run("search_products", { query: "mug" });
    expect(result.isError).toBe(true);
    expect(result.exchanges).toEqual([fresh]);
  });
});
