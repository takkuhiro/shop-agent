/** The language model, as the agent sees it. Anthropic is one adapter behind this. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  /** Opaque blocks the model produced; replayed unchanged on the next request. */
  content: string | unknown[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ModelTurn {
  content: unknown[];
  stopReason: "end_turn" | "tool_use" | "refusal" | "max_tokens" | "other";
  toolCalls: ToolCall[];
}

export interface ChatModel {
  respond(request: { system: string; tools: ToolSpec[]; messages: ChatMessage[]; onText: (delta: string) => void }): Promise<ModelTurn>;
}
