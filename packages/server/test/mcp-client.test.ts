import { describe, expect, it, vi } from "vitest";
import { AuthRequiredError } from "../src/domain/errors.js";
import type { Exchange } from "../src/domain/exchange.js";
import { HttpShopMcp, ShopMcpError, TransientShopMcpError } from "../src/infrastructure/shop/client.js";

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}
const ok = (text: string, isError = false) => ({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }], isError } });

describe("HttpShopMcp.callTool", () => {
  it("sends the stateless-protocol headers and _meta", async () => {
    const fetchFn = fakeFetch(ok("{}"));
    await new HttpShopMcp({ fetch: fetchFn }).callTool("search_catalog", { catalog: { query: "x" } });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://mcp.shop.com");
    const headers = init!.headers as Record<string, string>;
    expect(headers["Mcp-Method"]).toBe("tools/call");
    expect(headers["Mcp-Name"]).toBe("search_catalog");
    expect(headers["mcp-protocol-version"]).toBe("2026-07-28");
    expect(headers.accept).toContain("text/event-stream");
    expect(headers.authorization).toBeUndefined();
    const body = JSON.parse(init!.body as string);
    expect(body.params._meta["io.modelcontextprotocol/protocolVersion"]).toBe("2026-07-28");
  });

  it("adds the bearer token when the shopper is signed in", async () => {
    const fetchFn = fakeFetch(ok("{}"));
    await new HttpShopMcp({ fetch: fetchFn, accessToken: async () => "tok" }).callTool("get_account", {});
    expect((fetchFn.mock.calls[0]![1]!.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("turns HTTP 401 into AuthRequiredError", async () => {
    await expect(new HttpShopMcp({ fetch: fakeFetch("", 401) }).callTool("get_account", {})).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("parses JSON text content and keeps tool errors as data", async () => {
    const client = new HttpShopMcp({ fetch: fakeFetch(ok('{"messages":[{"code":"out_of_stock"}]}', true)) });
    expect(await client.callTool("create_checkout", {})).toEqual({ isError: true, data: { messages: [{ code: "out_of_stock" }] } });
  });

  it("returns plain text when the content is not JSON", async () => {
    expect((await new HttpShopMcp({ fetch: fakeFetch(ok("not json")) }).callTool("x", {})).data).toBe("not json");
  });

  it("throws ShopMcpError on a JSON-RPC error", async () => {
    const client = new HttpShopMcp({ fetch: fakeFetch({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad" } }) });
    await expect(client.callTool("x", {})).rejects.toBeInstanceOf(ShopMcpError);
  });

  it("reports 429, 502 and 503 as transient", async () => {
    for (const status of [429, 502, 503]) {
      await expect(new HttpShopMcp({ fetch: fakeFetch("", status) }).callTool("get_cart", {})).rejects.toBeInstanceOf(
        TransientShopMcpError,
      );
    }
  });

  it("reports a network failure as transient", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(new HttpShopMcp({ fetch: fetchFn }).callTool("get_cart", {})).rejects.toBeInstanceOf(TransientShopMcpError);
  });

  it("gives every request a timeout", async () => {
    const fetchFn = fakeFetch(ok("{}"));
    await new HttpShopMcp({ fetch: fetchFn }).callTool("get_cart", {});
    expect(fetchFn.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports each HTTP exchange with the bearer token hidden and credentials redacted", async () => {
    const seen: Exchange[] = [];
    const reply = ok(JSON.stringify({ id: "co1", payment: { instruments: [{ credential: { token: "secret" } }] } }));
    const client = new HttpShopMcp({ fetch: fakeFetch(reply), accessToken: async () => "tok", onExchange: (e) => seen.push(e) });
    await client.callTool("complete_checkout", { shop: "s", id: "co1" });

    const [e] = seen;
    expect(seen).toHaveLength(1);
    expect(e!.request).toMatchObject({ method: "POST", url: "https://mcp.shop.com" });
    expect(e!.request.headers.authorization).toBe("Bearer [redacted]");
    expect((e!.request.body as any).params).toMatchObject({ name: "complete_checkout", arguments: { shop: "s", id: "co1" } });
    expect(e!.response!.status).toBe(200);
    expect(JSON.stringify(e!.response!.body)).not.toContain("secret");
    expect(e!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports failed exchanges too: HTTP errors keep the status, network errors keep the message", async () => {
    const seen: Exchange[] = [];
    await expect(
      new HttpShopMcp({ fetch: fakeFetch("", 503), onExchange: (e) => seen.push(e) }).callTool("get_cart", {}),
    ).rejects.toBeDefined();
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(new HttpShopMcp({ fetch: down, onExchange: (e) => seen.push(e) }).callTool("get_cart", {})).rejects.toBeDefined();
    expect(seen[0]!.response!.status).toBe(503);
    expect(seen[1]!.response).toBeUndefined();
    expect(seen[1]!.error).toBe("fetch failed");
  });
});
