import { randomUUID } from "node:crypto";
import type { CartLine } from "./cart.js";
import type { Checkout, PaymentInstrument } from "./checkout.js";
import { DomainError } from "./errors.js";
import type { Money } from "./money.js";

export type ApprovalState = "pending" | "approving" | "completed" | "rejected" | "failed" | "unknown";

/**
 * The shopper's explicit go-ahead to pay for one exact checkout.
 * It pins the items and total the shopper saw, and allows at most one completion attempt:
 * complete_checkout must never be retried, even after an uncertain failure.
 */
export class PurchaseApproval {
  readonly id = randomUUID();
  private current: ApprovalState = "pending";
  private order?: string;
  private message?: string;

  private constructor(
    readonly shop: string,
    readonly checkoutId: string,
    readonly lines: CartLine[],
    readonly total: Money,
    readonly instruments: PaymentInstrument[],
  ) {}

  static request(checkout: Checkout): PurchaseApproval {
    if (checkout.status !== "ready_for_complete") {
      throw new DomainError(`checkout is ${checkout.status}, not ready to complete in the app`);
    }
    if (checkout.instruments.length === 0) throw new DomainError("the merchant offered no payment method");
    if (!checkout.total) throw new DomainError("the checkout has no total");
    // In the store we tried, the API completed the checkout from the budget the shopper gave this app and refused the saved card.
    // So the budget is the only button when it is offered.
    const budget = checkout.instruments.filter((i) => i.raw.type === "delegated_budget");
    const offered = budget.length > 0 ? budget : checkout.instruments;
    return new PurchaseApproval(checkout.shop, checkout.id, checkout.lines, checkout.total, offered);
  }

  get state(): ApprovalState {
    return this.current;
  }
  get orderId(): string | undefined {
    return this.order;
  }
  get note(): string | undefined {
    return this.message;
  }

  /** Same checkout, same items, same total as the shopper approved. */
  matches(checkout: Checkout): boolean {
    return (
      checkout.shop === this.shop &&
      checkout.id === this.checkoutId &&
      this.total.equals(checkout.total) &&
      checkout.lines.length === this.lines.length &&
      checkout.lines.every((l, i) => l.variantId === this.lines[i]!.variantId && l.quantity === this.lines[i]!.quantity)
    );
  }

  /** Claims the single attempt. Returns the instrument to send. */
  beginApproval(instrumentId: string): PaymentInstrument {
    if (this.current !== "pending") throw new DomainError(`this purchase is already ${this.current}`);
    const instrument = this.instruments.find((i) => i.id === instrumentId);
    if (!instrument) throw new DomainError("unknown payment method");
    this.current = "approving";
    return instrument;
  }

  reject(): void {
    if (this.current !== "pending") throw new DomainError(`this purchase is already ${this.current}`);
    this.current = "rejected";
  }

  markCompleted(orderId?: string): void {
    this.current = "completed";
    this.order = orderId;
  }

  markFailed(note: string): void {
    this.current = "failed";
    this.message = note;
  }

  /** The completion call may or may not have gone through. */
  markUnknown(note: string): void {
    this.current = "unknown";
    this.message = note;
  }
}
