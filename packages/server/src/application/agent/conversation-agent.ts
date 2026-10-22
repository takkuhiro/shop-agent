import type { ChatEvent } from "@shop-agent/contract";
import type { ChatMessage, ChatModel, ToolSpec } from "./ports.js";
import type { ToolResult } from "./toolbox.js";

export interface ToolRunner {
  specs: ToolSpec[];
  run(name: string, input: unknown): Promise<ToolResult>;
}

interface Options {
  model: ChatModel;
  tools: ToolRunner;
  systemPrompt: string;
  maxToolRounds?: number;
}

/** One shopper's conversation: the message history and the tool loop. */
export class ConversationAgent {
  private readonly messages: ChatMessage[] = [];
  private notices: string[] = [];
  private busy = false;

  constructor(private readonly options: Options) {}

  /** Facts the app learned outside the chat (signed in, purchase result). Delivered with the next user message. */
  addNotice(text: string): void {
    this.notices.push(text);
  }

  get isBusy(): boolean {
    return this.busy;
  }

  async handle(text: string, hint: string | undefined, emit: (event: ChatEvent) => void): Promise<void> {
    if (this.busy) throw new Error("the agent is still answering the previous message");
    this.busy = true;
    try {
      this.messages.push({ role: "user", content: this.userContent(text, hint) });
      await this.loop(emit);
    } finally {
      this.busy = false;
    }
  }

  private userContent(text: string, hint: string | undefined): string {
    const notes = this.notices.map((n) => `[app notice] ${n}`);
    this.notices = [];
    return [...notes, text, ...(hint ? [`[app context for the message above] ${hint}`] : [])].join("\n");
  }

  private async loop(emit: (event: ChatEvent) => void): Promise<void> {
    const maxRounds = this.options.maxToolRounds ?? 12;
    for (let round = 0; round < maxRounds; round++) {
      const turn = await this.options.model.respond({
        system: this.options.systemPrompt,
        tools: this.options.tools.specs,
        messages: this.messages,
        onText: (delta) => emit({ type: "text", delta }),
      });
      // Keep the whole content (thinking blocks included) so the next request replays it unchanged.
      this.messages.push({ role: "assistant", content: turn.content });

      if (turn.stopReason === "refusal") return emit({ type: "text", delta: "\n(The model declined this request.)" });
      if (turn.stopReason === "max_tokens") return emit({ type: "text", delta: "\n(The reply was cut off.)" });
      if (turn.stopReason !== "tool_use" || turn.toolCalls.length === 0) return;

      // Parallel tool calls: all results go back in a single user message.
      const results: unknown[] = [];
      for (const call of turn.toolCalls) {
        emit({ type: "tool", id: call.id, name: call.name, input: call.input });
        const started = Date.now();
        const result = await this.options.tools.run(call.name, call.input);
        emit({
          type: "tool_result",
          id: call.id,
          isError: result.isError,
          content: result.content,
          exchanges: result.exchanges,
          durationMs: Date.now() - started,
        });
        for (const event of result.events) emit(event);
        results.push({ type: "tool_result", tool_use_id: call.id, content: result.content, ...(result.isError && { is_error: true }) });
      }
      this.messages.push({ role: "user", content: results });
    }
    emit({ type: "text", delta: "\n(Stopped after too many tool calls.)" });
  }
}
