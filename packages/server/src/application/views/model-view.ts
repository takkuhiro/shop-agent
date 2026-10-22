import type { Cart, CartLine } from "../../domain/cart.js";
import type { Product } from "../../domain/catalog.js";
import type { Checkout } from "../../domain/checkout.js";

/**
 * What the model reads. A raw Shop search is ~100KB; this keeps only what is needed to
 * recommend, add to a cart and explain a checkout, with prices already formatted.
 */
export function productForModel(p: Product) {
  return {
    product_id: p.id,
    title: p.title,
    rating: p.rating,
    options: p.options,
    variants: p.variants.map((v) => ({
      variant_id: v.id,
      options: v.options,
      price: v.price?.format(),
      list_price: v.listPrice?.format(),
      available: v.available,
      url: v.url,
      seller: v.seller,
      shop: v.shop,
    })),
  };
}

function linesForModel(lines: CartLine[]) {
  return lines.map((l) => ({
    variant_id: l.variantId,
    title: l.title,
    quantity: l.quantity,
    unit_price: l.unitPrice?.format(),
    line_total: l.lineTotal?.format(),
  }));
}

export function cartForModel(c: Cart) {
  return {
    shop: c.shop,
    items: linesForModel(c.lines),
    subtotal: c.subtotal?.format(),
    total: c.total?.format(),
    messages: c.notices,
  };
}

export function checkoutForModel(c: Checkout, signedIn: boolean, payableInApp: boolean) {
  return {
    shop: c.shop,
    status: c.status,
    items: linesForModel(c.lines),
    subtotal: c.subtotal?.format(),
    total: c.total?.format(),
    messages: c.notices,
    continue_url: c.continueUrl,
    signed_in: signedIn,
    payable_in_app: payableInApp,
    next_step: payableInApp
      ? "Call request_purchase so the shopper can approve and pay in this app."
      : signedIn
        ? "This checkout cannot be paid in the app yet. Give the shopper the continue_url to finish on the merchant's page, and show the messages."
        : "The shopper is not signed in. Offer two choices: sign in to Shop (call request_login) so they can pay here, or finish on the merchant's page with the continue_url. Show the messages.",
  };
}
