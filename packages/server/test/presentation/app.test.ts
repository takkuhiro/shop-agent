import { describe, expect, it } from "vitest";
import { ConversationAgent } from "../../src/application/agent/conversation-agent.js";
import { Session } from "../../src/application/session.js";
import { SessionState } from "../../src/application/session-state.js";
import { createApp } from "../../src/presentation/app.js";

function app() {
  return createApp({
    createSession: () => {
      const agent = new ConversationAgent({
        model: { respond: async (r) => (r.onText("こんにちは"), { content: [], toolCalls: [], stopReason: "end_turn" }) },
        tools: { specs: [], run: async () => ({ content: "", isError: false, events: [], exchanges: [] }) },
        systemPrompt: "s",
      });
      const auth = {
        available: false,
        signedIn: false,
        start: async () => {
          throw new Error("x");
        },
        poll: async () => "pending" as const,
        async signOut() {},
      };
      return new Session(
        "s1",
        { country: "JP", currency: "JPY", language: "ja" },
        agent,
        auth,
        new SessionState(),
        {} as never,
        {} as never,
      );
    },
  });
}

const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("API", () => {
  it("creates a session with the market and sign-in status", async () => {
    const res = await app().request("/api/sessions", { method: "POST" });
    expect(await res.json()).toMatchObject({
      sessionId: "s1",
      market: { country: "JP" },
      auth: { signedIn: false, loginAvailable: false },
    });
  });

  it("streams chat events as SSE and ends with done", async () => {
    const a = app();
    await a.request("/api/sessions", { method: "POST" });
    const res = await a.request("/api/sessions/s1/messages", json({ text: "やあ" }));
    const body = await res.text();
    expect(body).toContain('"type":"text"');
    expect(body.trim().endsWith('data: {"type":"done"}')).toBe(true);
  });

  it("rejects invalid messages and unknown sessions", async () => {
    const a = app();
    await a.request("/api/sessions", { method: "POST" });
    expect((await a.request("/api/sessions/s1/messages", json({ text: "" }))).status).toBe(400);
    expect((await a.request("/api/sessions/nope/messages", json({ text: "x" }))).status).toBe(404);
  });

  it("rejects cross-site POSTs", async () => {
    const res = await app().request("/api/sessions", { method: "POST", headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("fails login start when sign-in is not configured", async () => {
    const a = app();
    await a.request("/api/sessions", { method: "POST" });
    expect((await a.request("/api/sessions/s1/login", { method: "POST" })).status).toBe(502);
  });

  it("returns the transcript so the screen can be redrawn after a reload", async () => {
    const a = app();
    await a.request("/api/sessions", { method: "POST" });
    await (await a.request("/api/sessions/s1/messages", json({ text: "やあ" }))).text();
    const res = await a.request("/api/sessions/s1/transcript");
    expect(await res.json()).toEqual([
      { type: "user", text: "やあ" },
      { type: "text", delta: "こんにちは" },
    ]);
    expect((await a.request("/api/sessions/nope/transcript")).status).toBe(404);
  });

  it("answers 401 for the account connection while signed out", async () => {
    const a = app();
    await a.request("/api/sessions", { method: "POST" });
    expect((await a.request("/api/sessions/s1/account")).status).toBe(401);
  });
});
