import { describe, expect, it } from "vitest";
import { Money } from "../../src/domain/money.js";

describe("Money", () => {
  it("formats minor units per currency", () => {
    expect(new Money(4200, "USD").format()).toBe("$42.00");
    expect(new Money(5700, "JPY").format()).toBe("¥5,700");
  });

  it("converts whole-currency amounts to minor units", () => {
    expect(Money.fromMajor(5000, "JPY").amount).toBe(5000);
    expect(Money.fromMajor(42.5, "USD").amount).toBe(4250);
  });

  it("compares by amount and currency", () => {
    expect(new Money(1, "JPY").equals(new Money(1, "JPY"))).toBe(true);
    expect(new Money(1, "JPY").equals(new Money(1, "USD"))).toBe(false);
    expect(new Money(1, "JPY").equals(undefined)).toBe(false);
  });
});
