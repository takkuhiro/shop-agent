import { describe, expect, it } from "vitest";
import { linesAfterChange } from "../../src/domain/cart.js";
import { DomainError } from "../../src/domain/errors.js";

const line = (variantId: string, quantity: number) => ({ variantId, title: variantId, quantity });

describe("linesAfterChange", () => {
  it("adds a new variant", () => {
    expect(linesAfterChange([line("a", 1)], { variantId: "b", quantity: 2 })).toEqual([
      { variantId: "a", quantity: 1 },
      { variantId: "b", quantity: 2 },
    ]);
  });

  it("sets an existing variant to an absolute quantity", () => {
    expect(linesAfterChange([line("a", 1)], { variantId: "a", quantity: 3 })).toEqual([{ variantId: "a", quantity: 3 }]);
  });

  it("removes a variant at quantity 0", () => {
    expect(linesAfterChange([line("a", 1)], { variantId: "a", quantity: 0 })).toEqual([]);
  });

  it("rejects quantities outside 0..99", () => {
    expect(() => linesAfterChange([], { variantId: "a", quantity: -1 })).toThrow(DomainError);
    expect(() => linesAfterChange([], { variantId: "a", quantity: 100 })).toThrow(DomainError);
    expect(() => linesAfterChange([], { variantId: "a", quantity: 1.5 })).toThrow(DomainError);
  });
});
