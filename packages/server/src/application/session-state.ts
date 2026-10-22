import type { PurchaseApproval } from "../domain/approval.js";
import type { Cart } from "../domain/cart.js";
import { DomainError } from "../domain/errors.js";

/** What one shopping session remembers between tool calls. The model never sees these ids. */
export class SessionState {
  private readonly cartIds = new Map<string, string>();
  private readonly carts = new Map<string, Cart>();
  private readonly checkoutIds = new Map<string, string>();
  private readonly approvals = new Map<string, PurchaseApproval>();

  cartId(shop: string): string | undefined {
    return this.cartIds.get(shop);
  }

  remember(cart: Cart): void {
    this.cartIds.set(cart.shop, cart.id);
    if (cart.lines.length === 0) this.carts.delete(cart.shop);
    else this.carts.set(cart.shop, cart);
  }

  /** The cart was paid for: its ids are spent, so the next purchase from this shop starts a new cart. */
  forgetShop(shop: string): void {
    this.cartIds.delete(shop);
    this.carts.delete(shop);
    this.checkoutIds.delete(shop);
  }

  cartSnapshots(): Cart[] {
    return [...this.carts.values()];
  }

  shops(): string[] {
    return [...this.cartIds.keys()];
  }

  rememberCheckout(shop: string, checkoutId: string): void {
    this.checkoutIds.set(shop, checkoutId);
  }

  checkoutId(shop: string): string | undefined {
    return this.checkoutIds.get(shop);
  }

  addApproval(approval: PurchaseApproval): void {
    this.approvals.set(approval.id, approval);
  }

  approval(id: string): PurchaseApproval {
    const approval = this.approvals.get(id);
    if (!approval) throw new DomainError("unknown purchase");
    return approval;
  }
}
