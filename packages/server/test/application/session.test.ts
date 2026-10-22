import type { ChatEvent } from "@shop-agent/contract";
import { describe, expect, it } from "vitest";
import { ConversationAgent } from "../../src/application/agent/conversation-agent.js";
import type { ModelTurn } from "../../src/application/agent/ports.js";
import { Session } from "../../src/application/session.js";
import { SessionState } from "../../src/application/session-state.js";
import { PurchaseApproval } from "../../src/domain/approval.js";
import { Money } from "../../src/domain/money.js";

const end: ModelTurn = { content: [], stopReason: "end_turn", toolCalls: [] };

function session(
  run: (name: string) => Promise<any> = async () => ({ content: "", isError: false, events: [], exchanges: [] }),
  turns: ModelTurn[] = [end],
) {
  let i = 0;
  const agent = new ConversationAgent({
    model: {
      respond: async (r) => {
        r.onText("こん");
        r.onText("にちは");
        return turns[i++]!;
      },
    },
    tools: { specs: [], run },
    systemPrompt: "s",
  });
  const auth = {
    available: true,
    signedIn: false,
    start: async () => ({}) as never,
    poll: async () => "pending" as const,
    async signOut() {},
  };
  const state = new SessionState();
  return { s: new Session("s1", { country: "JP", currency: "JPY", language: "ja" }, agent, auth, state, {} as never, {} as never), state };
}

const events = async (s: Session, text = "やあ") => {
  const out: ChatEvent[] = [];
  await s.chat(text, undefined, (e) => out.push(e));
  return out;
};

describe("Session.chat and transcript", () => {
  it("records the shopper's message and merges streamed text into one entry", async () => {
    const { s } = session();
    await events(s, "こんにちは");
    expect(s.transcript()).toEqual([
      { type: "user", text: "こんにちは" },
      { type: "text", delta: "こんにちは" },
    ]);
  });

  it("still forwards every event to the caller, unmerged", async () => {
    const { s } = session();
    expect((await events(s)).map((e) => e.type)).toEqual(["text", "text"]);
  });

  it("leaves out cart snapshots, which the cart panel gets from the session itself", async () => {
    const tool: ModelTurn = { content: [], stopReason: "tool_use", toolCalls: [{ id: "t1", name: "view_carts", input: {} }] };
    const { s } = session(
      async () => ({ content: "{}", isError: false, events: [{ type: "carts", carts: [] }], exchanges: [] }),
      [tool, end],
    );
    await events(s);
    const types = s.transcript().map((e) => e.type);
    expect(types).toContain("tool");
    expect(types).toContain("tool_result");
    expect(types).not.toContain("carts");
  });

  it("records a failure as an error entry", async () => {
    const { s } = session(undefined, []);
    const out = await events(s);
    expect(out.at(-1)).toMatchObject({ type: "error" });
    expect(s.transcript().at(-1)).toMatchObject({ type: "error" });
  });

  it("shows an approval card in its current state, not the state it was first shown in", async () => {
    const approval = PurchaseApproval.request({
      shop: "s.myshopify.com",
      id: "co1",
      status: "ready_for_complete",
      lines: [],
      total: new Money(660, "JPY"),
      notices: [],
      instruments: [{ id: "i1", label: "Shop Pay", raw: {} }],
      deliveryMissing: false,
    } as never);
    const shown: ModelTurn = { content: [], stopReason: "tool_use", toolCalls: [{ id: "t1", name: "request_purchase", input: {} }] };
    const { s, state } = session(
      async () => ({
        content: "ok",
        isError: false,
        exchanges: [],
        events: [
          {
            type: "approval",
            approval: { id: approval.id, shop: approval.shop, items: [], total: "¥660", instruments: [], state: "pending" },
          },
        ],
      }),
      [shown, end],
    );
    state.addApproval(approval);
    await events(s);
    approval.reject();
    const entry = s.transcript().find((e) => e.type === "approval") as Extract<ChatEvent, { type: "approval" }>;
    expect(entry.approval.state).toBe("rejected");
  });
});

describe("Session.approve", () => {
  const checkout = {
    shop: "s.myshopify.com",
    id: "co1",
    status: "ready_for_complete",
    lines: [{ variantId: "v1", title: "一筆箋", quantity: 1, unitPrice: new Money(473, "JPY"), lineTotal: new Money(473, "JPY") }],
    total: new Money(1173, "JPY"),
    notices: [],
    instruments: [{ id: "i1", label: "Shop Pay", raw: {} }],
    deliveryMissing: false,
  };
  const cart = (shop: string) => ({ shop, id: `cart-${shop}`, lines: [{ variantId: "v1", title: "一筆箋", quantity: 1 }] }) as never;

  function paying(outcome: (a: PurchaseApproval) => void) {
    const { s, state } = session();
    const approval = PurchaseApproval.request(checkout as never);
    state.addApproval(approval);
    state.remember(cart("s.myshopify.com"));
    state.remember(cart("other.myshopify.com"));
    const paid = new Session(
      "s1",
      s.market,
      s.agent,
      s.auth,
      state,
      { execute: async () => (outcome(approval), approval) } as never,
      {} as never,
    );
    return { paid, state, approval };
  }

  it("clears the cart of the shop that was paid, and only that one", async () => {
    const { paid, state, approval } = paying((a) => a.markCompleted("order-1"));
    await paid.approve(approval.id, "i1");
    expect(state.cartSnapshots().map((c) => c.shop)).toEqual(["other.myshopify.com"]);
    expect(state.cartId("s.myshopify.com")).toBeUndefined();
  });

  it("tells the shopper in the chat that the order is placed", async () => {
    const { paid, approval } = paying((a) => a.markCompleted("order-1"));
    await paid.approve(approval.id, "i1");
    const last = paid.transcript().at(-1) as { type: string; delta: string };
    expect(last.type).toBe("text");
    expect(last.delta).toContain("注文が完了しました");
    expect(last.delta).toContain("一筆箋");
  });

  it("keeps the cart and says nothing about an order when the payment fails", async () => {
    const { paid, state, approval } = paying((a) => a.markFailed("declined"));
    await paid.approve(approval.id, "i1");
    expect(state.cartSnapshots()).toHaveLength(2);
    expect(paid.transcript().some((e) => e.type === "text")).toBe(false);
  });
});

describe("Session.connection", () => {
  const build = (signedIn: boolean, account: unknown) => {
    const { s } = session();
    return new Session("s1", s.market, s.agent, { ...s.auth, signedIn }, s.state, {} as never, account as never);
  };

  it("returns the budget part of the account when signed in", async () => {
    const s = build(true, { get: async () => ({ addresses: [], connection: { payment: { instruments: [] } } }) });
    expect(await s.connection()).toEqual({ payment: { instruments: [] } });
  });

  it("refuses when signed out, without asking Shop", async () => {
    const s = build(false, {
      get: async () => {
        throw new Error("must not be called");
      },
    });
    await expect(s.connection()).rejects.toThrow("sign-in");
  });
});
