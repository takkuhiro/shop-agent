import type { Notice } from "./catalog.js";
import { DomainError } from "./errors.js";
import type { Money } from "./money.js";

export interface LineRequest {
  variantId: string;
  quantity: number;
}

export interface CartLine {
  variantId: string;
  title: string;
  image?: string;
  quantity: number;
  unitPrice?: Money;
  lineTotal?: Money;
}

/** One merchant's cart. Carts never mix sellers. */
export interface Cart {
  shop: string;
  id: string;
  lines: CartLine[];
  subtotal?: Money;
  total?: Money;
  notices: Notice[];
  continueUrl?: string;
}

const MAX_QUANTITY = 99;

/** The lines a cart should have after "set variant X to quantity N" (0 removes it). */
export function linesAfterChange(current: CartLine[], change: LineRequest): LineRequest[] {
  if (!Number.isInteger(change.quantity) || change.quantity < 0 || change.quantity > MAX_QUANTITY) {
    throw new DomainError(`quantity must be a whole number between 0 and ${MAX_QUANTITY}`);
  }
  const lines = current.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
  const existing = lines.find((l) => l.variantId === change.variantId);
  if (existing) existing.quantity = change.quantity;
  else lines.push({ ...change });
  return lines.filter((l) => l.quantity > 0);
}
