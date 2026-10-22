import { AuthRequiredError } from "../../domain/errors.js";
import type { Exchange } from "../../domain/exchange.js";
import { redact } from "./redact.js";

const PROTOCOL_VERSION = "2026-07-28";

export class ShopMcpError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "ShopMcpError";
  }
}

export interface ToolResult {
  isError: boolean;
  data: unknown;
}

/** A failure that may succeed on another attempt: network error, timeout, 429, 502 or 503. */
export class TransientShopMcpError extends ShopMcpError {
  constructor(message: string) {
    super(message);
    this.name = "TransientShopMcpError";
  }
}

const REQUEST_TIMEOUT_MS = 30_000;
const TRANSIENT_STATUSES = new Set([429, 502, 503]);

/** What the gateways need from the Shop MCP server. */
export interface ShopMcp {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}

interface Options {
  endpoint?: string;
  fetch?: typeof fetch;
  /** The signed-in shopper's access token, if any. Called on every request so refreshes are picked up. */
  accessToken?: () => Promise<string | undefined>;
  /** Called once per HTTP request with what was sent and received, secrets removed. */
  onExchange?: (exchange: Exchange) => void;
}

/**
 * Minimal client for https://mcp.shop.com.
 * The server speaks the stateless 2026-07-28 protocol: no initialize handshake,
 * every request carries Mcp-Method / Mcp-Name headers and a _meta block.
 */
export class HttpShopMcp implements ShopMcp {
  private readonly endpoint: string;
  private readonly fetchFn: typeof fetch;
  private readonly accessToken?: () => Promise<string | undefined>;
  private readonly onExchange?: (exchange: Exchange) => void;
  private nextId = 1;

  constructor(options: Options = {}) {
    this.endpoint = options.endpoint ?? "https://mcp.shop.com";
    this.fetchFn = options.fetch ?? fetch;
    this.accessToken = options.accessToken;
    this.onExchange = options.onExchange;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
    };
    const token = await this.accessToken?.();
    if (token) headers.authorization = `Bearer ${token}`;

    const request = {
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    };
    const started = Date.now();
    let response: Response;
    let text: string;
    try {
      response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify(request),
      });
      text = await response.text();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.report(headers, request, started, undefined, message);
      throw new TransientShopMcpError(message);
    }
    this.report(headers, request, started, { status: response.status, text });
    if (TRANSIENT_STATUSES.has(response.status)) throw new TransientShopMcpError(`HTTP ${response.status}`);

    // Tools that need a signed-in shopper answer 401 with `WWW-Authenticate: Bearer ... scope="personal_agent"`.
    if (response.status === 401) throw new AuthRequiredError();

    let payload: { result?: Record<string, any>; error?: { code: number; message: string } };
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ShopMcpError(`unexpected response (HTTP ${response.status})`);
    }
    if (payload.error) throw new ShopMcpError(payload.error.message, payload.error.code);
    if (!payload.result) throw new ShopMcpError(`empty response (HTTP ${response.status})`);

    const content = (payload.result.content ?? []) as { type: string; text?: string }[];
    const body = content.find((c) => c.type === "text")?.text ?? "";
    return { isError: Boolean(payload.result.isError), data: parseJson(body) };
  }

  private report(
    headers: Record<string, string>,
    request: unknown,
    started: number,
    response?: { status: number; text: string },
    error?: string,
  ): void {
    if (!this.onExchange) return;
    const shown = { ...headers };
    if (shown.authorization) shown.authorization = "Bearer [redacted]";
    this.onExchange({
      request: { method: "POST", url: this.endpoint, headers: shown, body: redact(request) },
      response: response && { status: response.status, body: redact(response.text) },
      error,
      durationMs: Date.now() - started,
    });
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
