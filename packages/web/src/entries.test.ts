import type { TranscriptEntry } from "@shop-agent/contract";
import { describe, expect, it } from "vitest";
import { applyEvent, type Entry, replay } from "./entries";

const none: Entry[] = [];

describe("applyEvent", () => {
  it("appends streamed text to the assistant bubble that is already open", () => {
    const entries = replay([
      { type: "text", delta: "こん" },
      { type: "text", delta: "にちは" },
    ]);
    expect(entries).toEqual([{ kind: "assistant", text: "こんにちは" }]);
  });

  it("starts a new assistant bubble after anything else", () => {
    const entries = replay([
      { type: "user", text: "q" },
      { type: "text", delta: "a" },
    ]);
    expect(entries).toEqual([
      { kind: "user", text: "q" },
      { kind: "assistant", text: "a" },
    ]);
  });

  it("attaches a tool result to its tool call by id", () => {
    const entries = replay([
      { type: "tool", id: "t1", name: "search_products", input: { query: "mug" } },
      { type: "tool_result", id: "t1", isError: false, content: "{}", exchanges: [], durationMs: 7 },
    ]);
    expect(entries).toEqual([
      {
        kind: "tool",
        id: "t1",
        name: "search_products",
        input: { query: "mug" },
        result: { isError: false, content: "{}", exchanges: [], durationMs: 7 },
      },
    ]);
  });

  it("shows the sign-in card only once", () => {
    const entries = replay([
      { type: "auth_required", reason: "a" },
      { type: "auth_required", reason: "b" },
    ]);
    expect(entries.filter((e) => e.kind === "login")).toHaveLength(1);
  });

  it("ignores events that have no place in the chat", () => {
    expect(applyEvent(none, { type: "carts", carts: [] })).toBe(none);
    expect(applyEvent(none, { type: "done" })).toBe(none);
  });

  it("turns an error into an error entry", () => {
    expect(replay([{ type: "error", message: "boom" }])).toEqual([{ kind: "error", message: "boom" }]);
  });
});

describe("replay", () => {
  it("rebuilds the same screen from a stored transcript as from live events", () => {
    const events: TranscriptEntry[] = [
      { type: "user", text: "q" },
      { type: "tool", id: "t1", name: "view_carts", input: {} },
      { type: "tool_result", id: "t1", isError: false, content: "{}", exchanges: [], durationMs: 1 },
      { type: "text", delta: "done" },
    ];
    expect(replay(events).map((e) => e.kind)).toEqual(["user", "tool", "assistant"]);
  });
});
