import type { CartDto } from "@shop-agent/contract";
import { LineItems } from "./LineItems";
import { Muted } from "./ui/Muted";

export function CartView({ cart }: { cart: CartDto }) {
  return (
    <div className="cart">
      <Muted>{cart.shop}</Muted>
      <LineItems items={cart.items} />
      <div className="total">合計 {cart.total ?? cart.subtotal}</div>
    </div>
  );
}
