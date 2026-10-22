import type { ChatEvent } from "@shop-agent/contract";
import { describe, expect, it } from "vitest";
import { ConversationAgent } from "../../src/application/agent/conversation-agent.js";
import type { ChatMessage, ChatModel, ModelTurn } from "../../src/application/agent/ports.js";

function scriptedModel(turns: ModelTurn[], seen: ChatMessage[][] = []): ChatModel {
  let i = 0;
  return {
    async respond(req) {
      seen.push(structuredClone(req.messages));
      const turn = turns[i++]!;
      req.onText("hi");
      return turn;
    },
  };
}

const end: ModelTurn = { content: [{ type: "text", text: "hi" }], stopReason: "end_turn", toolCalls: [] };
const toolTurn: ModelTurn = {
  content: [{ type: "tool_use", id: "t1", name: "view_carts", input: {} }],
  stopReason: "tool_use",
  toolCalls: [{ id: "t1", name: "view_carts", input: {} }],
};

describe("ConversationAgent", () => {
  it("runs a tool, emits its UI events, and sends the result back", async () => {
    const seen: ChatMessage[][] = [];
    const tools = {
      specs: [],
      run: async () => ({
        content: "{}",
        isError: false,
        events: [{ type: "carts", carts: [] } as ChatEvent],
        exchanges: [{ request: { method: "POST", url: "u", headers: {}, body: {} }, durationMs: 5 }],
      }),
    };
    const agent = new ConversationAgent({ model: scriptedModel([toolTurn, end], seen), tools, systemPrompt: "s" });
    const events: ChatEvent[] = [];
    await agent.handle("show carts", undefined, (e) => events.push(e));

    expect(events.map((e) => e.type)).toEqual(["text", "tool", "tool_result", "carts", "text"]);
    expect(events[1]).toEqual({ type: "tool", id: "t1", name: "view_carts", input: {} });
    expect(events[2]).toMatchObject({
      type: "tool_result",
      id: "t1",
      isError: false,
      content: "{}",
      exchanges: [expect.objectContaining({ durationMs: 5 })],
    });
    const last = seen[1]!.at(-1)!;
    expect(last.role).toBe("user");
    expect((last.content as any[])[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1", content: "{}" });
  });

  it("marks failed tool results as errors", async () => {
    const seen: ChatMessage[][] = [];
    const tools = { specs: [], run: async () => ({ content: "boom", isError: true, events: [], exchanges: [] }) };
    const agent = new ConversationAgent({ model: scriptedModel([toolTurn, end], seen), tools, systemPrompt: "s" });
    await agent.handle("x", undefined, () => {});
    expect((seen[1]!.at(-1)!.content as any[])[0].is_error).toBe(true);
  });

  it("delivers notices and hints with the next user message, once", async () => {
    const seen: ChatMessage[][] = [];
    const tools = { specs: [], run: async () => ({ content: "", isError: false, events: [], exchanges: [] }) };
    const agent = new ConversationAgent({ model: scriptedModel([end, end], seen), tools, systemPrompt: "s" });
    agent.addNotice("The shopper has signed in to Shop.");
    await agent.handle("hello", "variant v1", () => {});
    await agent.handle("again", undefined, () => {});

    const first = seen[0]!.at(-1)!.content as string;
    expect(first).toContain("[app notice] The shopper has signed in to Shop.");
    expect(first).toContain("hello");
    expect(first).toContain("variant v1");
    expect(seen[1]!.at(-1)!.content).toBe("again");
  });

  it("stops after too many tool rounds", async () => {
    const tools = { specs: [], run: async () => ({ content: "", isError: false, events: [], exchanges: [] }) };
    const agent = new ConversationAgent({
      model: { respond: async () => toolTurn },
      tools,
      systemPrompt: "s",
      maxToolRounds: 3,
    });
    const events: ChatEvent[] = [];
    await agent.handle("loop", undefined, (e) => events.push(e));
    expect(events.filter((e) => e.type === "tool")).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({ type: "text" });
  });

  it("rejects a second message while busy", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const agent = new ConversationAgent({
      model: { respond: async () => (await gate, end) },
      tools: { specs: [], run: async () => ({ content: "", isError: false, events: [], exchanges: [] }) },
      systemPrompt: "s",
    });
    const first = agent.handle("a", undefined, () => {});
    await expect(agent.handle("b", undefined, () => {})).rejects.toThrow(/still answering/);
    release();
    await first;
    expect(agent.isBusy).toBe(false);
  });
});
