import type { ApprovalDto, CheckoutDto, ExchangeDto, ProductDto, TranscriptEntry } from "@shop-agent/contract";

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  result?: { isError: boolean; content: string; exchanges: ExchangeDto[]; durationMs: number };
}

/** One thing on the chat screen. */
export type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | ({ kind: "tool" } & ToolCall)
  | { kind: "products"; products: ProductDto[] }
  | { kind: "checkout"; checkout: CheckoutDto }
  | { kind: "approval"; approval: ApprovalDto }
  | { kind: "login"; reason: string }
  | { kind: "error"; message: string };

/** The chat screen after one more event. Live events and a stored transcript go through the same function. */
export function applyEvent(entries: Entry[], event: TranscriptEntry): Entry[] {
  switch (event.type) {
    case "user":
      return [...entries, { kind: "user", text: event.text }];
    case "text": {
      const last = entries.at(-1);
      return last?.kind === "assistant"
        ? [...entries.slice(0, -1), { kind: "assistant", text: last.text + event.delta }]
        : [...entries, { kind: "assistant", text: event.delta }];
    }
    case "tool":
      return [...entries, { kind: "tool", id: event.id, name: event.name, input: event.input }];
    case "tool_result": {
      const { id, type: _type, ...result } = event;
      return entries.map((x) => (x.kind === "tool" && x.id === id ? { ...x, result } : x));
    }
    case "products":
      return [...entries, { kind: "products", products: event.products }];
    case "checkout":
      return [...entries, { kind: "checkout", checkout: event.checkout }];
    case "approval":
      return [...entries, { kind: "approval", approval: event.approval }];
    case "auth_required":
      return entries.some((x) => x.kind === "login") ? entries : [...entries, { kind: "login", reason: event.reason }];
    case "error":
      return [...entries, { kind: "error", message: event.message }];
    default:
      return entries; // carts and done are not part of the chat
  }
}

export const replay = (events: TranscriptEntry[], from: Entry[] = []): Entry[] => events.reduce(applyEvent, from);
