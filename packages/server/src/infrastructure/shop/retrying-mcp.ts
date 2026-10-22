import { randomUUID } from "node:crypto";
import { type ShopMcp, type ToolResult, TransientShopMcpError } from "./client.js";

const READS = new Set(["search_catalog", "lookup_catalog", "get_product", "get_cart", "get_checkout", "get_account", "search_orders"]);
/** Writes the server de-duplicates by idempotency key, so an exact retry cannot create a second cart or checkout. */
const KEYED_WRITES = new Set(["create_cart", "update_cart", "create_checkout", "update_checkout"]);

const MAX_ATTEMPTS = 3;

interface Options {
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Retries transient failures. Everything else, complete_checkout above all, is attempted once:
 * after an uncertain payment the app reads the checkout instead of paying again.
 */
export class RetryingShopMcp implements ShopMcp {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly inner: ShopMcp,
    options: Options = {},
  ) {
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const retryable = READS.has(name) || KEYED_WRITES.has(name);
    // One key per logical write, reused by every attempt of it.
    const sent = KEYED_WRITES.has(name) ? { ...args, meta: { "idempotency-key": randomUUID() } } : args;

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.inner.callTool(name, sent);
      } catch (error) {
        if (!retryable || !(error instanceof TransientShopMcpError) || attempt >= MAX_ATTEMPTS) throw error;
        await this.sleep(500 * 2 ** (attempt - 1));
      }
    }
  }
}
