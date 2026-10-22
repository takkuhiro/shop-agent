import { type Cart, linesAfterChange } from "../../domain/cart.js";
import { DomainError } from "../../domain/errors.js";
import type { Market } from "../../domain/market.js";
import type { CartGateway } from "../../domain/ports.js";
import type { SessionState } from "../session-state.js";

export class SetCartItem {
  constructor(
    private readonly carts: CartGateway,
    private readonly state: SessionState,
    private readonly market: Market,
  ) {}

  async execute(shop: string, variantId: string, quantity: number): Promise<Cart> {
    const cartId = this.state.cartId(shop);
    let cart: Cart;
    if (!cartId) {
      if (quantity === 0) throw new DomainError("nothing to remove: there is no cart for this shop");
      const lines = linesAfterChange([], { variantId, quantity });
      cart = await this.carts.create(shop, lines, this.market);
    } else {
      const current = await this.carts.get(shop, cartId);
      cart = await this.carts.replaceLines(shop, cartId, linesAfterChange(current.lines, { variantId, quantity }));
    }
    this.state.remember(cart);
    return cart;
  }
}

export class ViewCarts {
  constructor(
    private readonly carts: CartGateway,
    private readonly state: SessionState,
  ) {}

  async execute(): Promise<Cart[]> {
    for (const shop of this.state.shops()) {
      this.state.remember(await this.carts.get(shop, this.state.cartId(shop)!));
    }
    return this.state.cartSnapshots();
  }
}
