/** One HTTP request to the Shop MCP server and what came back, as shown in the developer view. */
export interface Exchange {
  request: { method: string; url: string; headers: Record<string, string>; body: unknown };
  /** Absent when the request never got an answer (network error, timeout). */
  response?: { status: number; body: unknown };
  error?: string;
  durationMs: number;
}

/** Collects exchanges while a tool runs so they can be shown with that tool call. */
export class ExchangeLog {
  private items: Exchange[] = [];

  record(exchange: Exchange): void {
    this.items.push(exchange);
  }

  /** Returns what was recorded since the last drain. */
  drain(): Exchange[] {
    const taken = this.items;
    this.items = [];
    return taken;
  }
}
