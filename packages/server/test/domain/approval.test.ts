import { describe, expect, it } from "vitest";
import { PurchaseApproval } from "../../src/domain/approval.js";
import type { Checkout } from "../../src/domain/checkout.js";
import { DomainError } from "../../src/domain/errors.js";
import { Money } from "../../src/domain/money.js";

const checkout = (over: Partial<Checkout> = {}): Checkout => ({
  shop: "a.myshopify.com",
  id: "co-1",
  status: "ready_for_complete",
  lines: [{ variantId: "v1", title: "Mug", quantity: 2 }],
  total: new Money(11400, "JPY"),
  notices: [],
  instruments: [{ id: "i1", label: "Shop Pay", raw: { id: "i1", type: "shop_pay" } }],
  deliveryMissing: false,
  ...over,
});

describe("PurchaseApproval payment methods", () => {
  const card = { id: "card", label: "visa •••• 4242", raw: { id: "card", type: "shop_pay" } };
  const budget = { id: "budget", label: "エージェント用の予算", raw: { id: "budget", type: "delegated_budget" } };

  it("offers only the agent budget when there is one, because Shop refuses the saved card over the API", () => {
    const approval = PurchaseApproval.request(checkout({ instruments: [card, budget] }));
    expect(approval.instruments.map((i) => i.id)).toEqual(["budget"]);
    expect(() => approval.beginApproval("card")).toThrow(DomainError);
  });

  it("offers everything the merchant returned when there is no agent budget", () => {
    const approval = PurchaseApproval.request(checkout({ instruments: [card] }));
    expect(approval.instruments.map((i) => i.id)).toEqual(["card"]);
  });
});

describe("PurchaseApproval", () => {
  it("only starts from a ready checkout with instruments and a total", () => {
    expect(() => PurchaseApproval.request(checkout({ status: "requires_escalation" }))).toThrow(DomainError);
    expect(() => PurchaseApproval.request(checkout({ instruments: [] }))).toThrow(DomainError);
    expect(() => PurchaseApproval.request(checkout({ total: undefined }))).toThrow(DomainError);
    expect(PurchaseApproval.request(checkout()).state).toBe("pending");
  });

  it("matches only the same checkout, items and total", () => {
    const approval = PurchaseApproval.request(checkout());
    expect(approval.matches(checkout())).toBe(true);
    expect(approval.matches(checkout({ total: new Money(12000, "JPY") }))).toBe(false);
    expect(approval.matches(checkout({ lines: [{ variantId: "v1", title: "Mug", quantity: 3 }] }))).toBe(false);
    expect(approval.matches(checkout({ id: "co-2" }))).toBe(false);
  });

  it("allows exactly one completion attempt", () => {
    const approval = PurchaseApproval.request(checkout());
    expect(approval.beginApproval("i1").id).toBe("i1");
    expect(approval.state).toBe("approving");
    expect(() => approval.beginApproval("i1")).toThrow(DomainError);
  });

  it("rejects an instrument the merchant did not offer", () => {
    const approval = PurchaseApproval.request(checkout());
    expect(() => approval.beginApproval("nope")).toThrow(DomainError);
    expect(approval.state).toBe("pending");
  });

  it("cannot be approved after it was rejected", () => {
    const approval = PurchaseApproval.request(checkout());
    approval.reject();
    expect(() => approval.beginApproval("i1")).toThrow(DomainError);
  });
});
