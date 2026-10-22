import type Anthropic from "@anthropic-ai/sdk";
import type { ChatModel, ModelTurn } from "../../application/agent/ports.js";

interface Options {
  client: Anthropic;
  model: string;
}

/** ChatModel backed by the Anthropic Messages API. */
export class AnthropicChatModel implements ChatModel {
  constructor(private readonly options: Options) {}

  async respond(request: Parameters<ChatModel["respond"]>[0]): Promise<ModelTurn> {
    const stream = this.options.client.beta.messages.stream({
      model: this.options.model,
      max_tokens: 16000,
      system: request.system,
      tools: request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      })),
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: request.messages as Anthropic.Beta.BetaMessageParam[],
    });
    stream.on("text", request.onText);
    const message = await stream.finalMessage();

    const toolCalls = message.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));
    const stop = message.stop_reason;
    return {
      content: message.content,
      toolCalls,
      stopReason: stop === "end_turn" || stop === "tool_use" || stop === "refusal" || stop === "max_tokens" ? stop : "other",
    };
  }
}
