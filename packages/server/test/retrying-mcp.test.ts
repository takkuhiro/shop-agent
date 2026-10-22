import { describe, expect, it } from "vitest";
import { AuthRequiredError } from "../src/domain/errors.js";
import { type ShopMcp, ShopMcpError, TransientShopMcpError } from "../src/infrastructure/shop/client.js";
import { RetryingShopMcp } from "../src/infrastructure/shop/retrying-mcp.js";

function flaky(failures: number, error: Error = new TransientShopMcpError("timeout")) {
  const calls: { name: string; args: any }[] = [];
  const inner: ShopMcp = {
    async callTool(name, args) {
      calls.push({ name, args: structuredClone(args) });
      if (calls.length <= failures) throw error;
      return { isError: false, data: { ok: true } };
    },
  };
  return { inner, calls };
}

const retrying = (inner: ShopMcp) => new RetryingShopMcp(inner, { sleep: async () => {} });

describe("RetryingShopMcp", () => {
  it("retries reads after a transient failure without adding a key", async () => {
    const { inner, calls } = flaky(2);
    await retrying(inner).callTool("search_catalog", { catalog: {} });
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.args.meta === undefined)).toBe(true);
  });

  it("retries create and update with one idempotency key reused across attempts", async () => {
    const { inner, calls } = flaky(2);
    await retrying(inner).callTool("create_checkout", { shop: "s", checkout: {} });
    const keys = calls.map((c) => c.args.meta["idempotency-key"]);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses a new key for each new write", async () => {
    const { inner, calls } = flaky(0);
    const mcp = retrying(inner);
    await mcp.callTool("update_cart", { shop: "s", id: "c", cart: {} });
    await mcp.callTool("update_cart", { shop: "s", id: "c", cart: {} });
    expect(calls[0]!.args.meta["idempotency-key"]).not.toBe(calls[1]!.args.meta["idempotency-key"]);
  });

  it("never retries complete_checkout and adds no key to it", async () => {
    const { inner, calls } = flaky(1);
    await expect(retrying(inner).callTool("complete_checkout", { shop: "s", id: "c", checkout: {} })).rejects.toBeInstanceOf(
      TransientShopMcpError,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args.meta).toBeUndefined();
  });

  it("gives up after three attempts", async () => {
    const { inner, calls } = flaky(10);
    await expect(retrying(inner).callTool("get_checkout", { shop: "s", id: "c" })).rejects.toBeInstanceOf(TransientShopMcpError);
    expect(calls).toHaveLength(3);
  });

  it("does not retry sign-in or protocol errors", async () => {
    for (const error of [new AuthRequiredError(), new ShopMcpError("bad request", -32602)]) {
      const { inner, calls } = flaky(5, error);
      await expect(retrying(inner).callTool("get_account", {})).rejects.toBe(error);
      expect(calls).toHaveLength(1);
    }
  });
});
