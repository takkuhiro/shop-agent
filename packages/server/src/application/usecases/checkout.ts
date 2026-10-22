import { PurchaseApproval } from "../../domain/approval.js";
import { type Checkout, isPayableInApp } from "../../domain/checkout.js";
import { DomainError } from "../../domain/errors.js";
import type { AccountGateway, Authenticator, CheckoutGateway } from "../../domain/ports.js";
import type { SessionState } from "../session-state.js";

export class StartCheckout {
  constructor(
    private readonly checkouts: CheckoutGateway,
    private readonly account: AccountGateway,
    private readonly auth: Authenticator,
    private readonly state: SessionState,
  ) {}

  async execute(shop: string): Promise<{ checkout: Checkout; signedIn: boolean; payableInApp: boolean }> {
    const cartId = this.state.cartId(shop);
    if (!cartId) throw new DomainError(`there is no cart for ${shop}; add an item first`);

    let checkout = await this.checkouts.createFromCart(shop, cartId);
    // Signed in shoppers have saved addresses: fill the delivery address instead of asking for it.
    if (this.auth.signedIn && checkout.deliveryMissing) {
      checkout = await this.checkouts.useAccountAddress(shop, checkout.id, await this.account.get());
    }
    this.state.rememberCheckout(shop, checkout.id);
    return { checkout, signedIn: this.auth.signedIn, payableInApp: isPayableInApp(checkout, this.auth.signedIn) };
  }
}

/** Asks the shopper to approve paying. Nothing is charged here. */
export class RequestPurchase {
  constructor(
    private readonly checkouts: CheckoutGateway,
    private readonly auth: Authenticator,
    private readonly state: SessionState,
  ) {}

  async execute(shop: string): Promise<PurchaseApproval> {
    const checkoutId = this.state.checkoutId(shop);
    if (!checkoutId) throw new DomainError(`start a checkout for ${shop} first`);
    if (!this.auth.signedIn) throw new DomainError("the shopper must sign in to Shop before paying in this app");
    const approval = PurchaseApproval.request(await this.checkouts.get(shop, checkoutId));
    this.state.addApproval(approval);
    return approval;
  }
}

export class ApprovePurchase {
  constructor(
    private readonly checkouts: CheckoutGateway,
    private readonly state: SessionState,
  ) {}

  /** Pays once. Any uncertainty is reconciled by reading the checkout, never by paying again. */
  async execute(approvalId: string, instrumentId: string): Promise<PurchaseApproval> {
    const approval = this.state.approval(approvalId);
    const instrument = approval.beginApproval(instrumentId);
    try {
      const fresh = await this.checkouts.get(approval.shop, approval.checkoutId);
      if (!approval.matches(fresh)) {
        approval.markFailed("The items or total changed after you reviewed them. Nothing was charged. Please review again.");
        return approval;
      }
      const result = await this.checkouts.complete(approval.shop, approval.checkoutId, instrument);
      if (result.status === "completed" && result.orderId) approval.markCompleted(result.orderId);
      else if (result.status === "completed") approval.markUnknown("The checkout is completed but no order number was returned.");
      else approval.markFailed(result.notices.map((n) => n.content).join(" ") || `The checkout is ${result.status}; nothing was charged.`);
    } catch (error) {
      await this.reconcile(approval, error);
    }
    return approval;
  }

  private async reconcile(approval: PurchaseApproval, error: unknown): Promise<void> {
    const cause = error instanceof Error ? error.message : String(error);
    try {
      const checkout = await this.checkouts.get(approval.shop, approval.checkoutId);
      if (checkout.status === "completed" && checkout.orderId) approval.markCompleted(checkout.orderId);
      else
        approval.markUnknown(
          `Could not confirm the purchase (${cause}). Check the merchant's email or your Shop orders before trying again.`,
        );
    } catch {
      approval.markUnknown(
        `Could not confirm the purchase (${cause}). Check the merchant's email or your Shop orders before trying again.`,
      );
    }
  }

  reject(approvalId: string): PurchaseApproval {
    const approval = this.state.approval(approvalId);
    approval.reject();
    return approval;
  }
}
