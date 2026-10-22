import type { CartLine } from "./cart.js";
import type { Notice } from "./catalog.js";
import type { Money } from "./money.js";

/** A way to pay that the merchant offers for this checkout. `raw` is sent back to the API unchanged. */
export interface PaymentInstrument {
  id: string;
  label: string;
  raw: Record<string, unknown>;
}

export type CheckoutStatus = "incomplete" | "requires_escalation" | "ready_for_complete" | "completed" | "canceled" | (string & {});

export interface Checkout {
  shop: string;
  id: string;
  status: CheckoutStatus;
  lines: CartLine[];
  subtotal?: Money;
  total?: Money;
  notices: Notice[];
  /** Where the shopper can finish on the merchant's page. */
  continueUrl?: string;
  instruments: PaymentInstrument[];
  orderId?: string;
  deliveryMissing: boolean;
}

/** Only a ready checkout with offered instruments can be paid inside the app. */
export function isPayableInApp(checkout: Checkout, signedIn: boolean): boolean {
  return signedIn && checkout.status === "ready_for_complete" && checkout.instruments.length > 0;
}

/** What Shop says about this sign-in itself: the Shop Pay budget it allows, pages to manage it. No personal data. */
export interface AccountConnection {
  payment?: unknown;
  links?: unknown;
  messages?: unknown;
}

export interface ShopAccount {
  connection?: AccountConnection;
  addresses: { id: string; raw: Record<string, unknown> }[];
  preferredAddressId?: string;
}
