import type { SessionDto } from "@shop-agent/contract";
import { describe, expect, it } from "vitest";
import { openSession } from "./open-session";

const dto = (id: string): SessionDto => ({
  sessionId: id,
  market: { country: "JP", currency: "JPY", language: "ja" },
  auth: { signedIn: false, loginAvailable: true },
  carts: [],
});

function memory(initial?: string) {
  const data = new Map<string, string>(initial ? [["shop-agent.sessionId", initial]] : []);
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("openSession", () => {
  it("starts a new session and remembers it when nothing is saved", async () => {
    const storage = memory();
    const out = await openSession({
      storage,
      get: async () => {
        throw new Error("unused");
      },
      create: async () => dto("new"),
    });
    expect(out).toMatchObject({ resumed: false, session: { sessionId: "new" } });
    expect(storage.data.get("shop-agent.sessionId")).toBe("new");
  });

  it("goes back to the saved session while the server still has it", async () => {
    const out = await openSession({ storage: memory("old"), get: async (id) => dto(id), create: async () => dto("new") });
    expect(out).toMatchObject({ resumed: true, session: { sessionId: "old" } });
  });

  it("starts over when the server no longer has the saved session", async () => {
    const storage = memory("gone");
    const out = await openSession({
      storage,
      get: async () => {
        throw new Error("session not found");
      },
      create: async () => dto("new"),
    });
    expect(out.resumed).toBe(false);
    expect(storage.data.get("shop-agent.sessionId")).toBe("new");
  });

  it("works when storage is unavailable", async () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const out = await openSession({ storage: broken, get: async (id) => dto(id), create: async () => dto("new") });
    expect(out).toMatchObject({ resumed: false, session: { sessionId: "new" } });
  });
});
