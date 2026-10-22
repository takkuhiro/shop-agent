import type { ApprovalDto, CartDto, CheckoutDto, ProductDto } from "@shop-agent/contract";
import type { PurchaseApproval } from "../../domain/approval.js";
import type { Cart, CartLine } from "../../domain/cart.js";
import type { Product } from "../../domain/catalog.js";
import type { Checkout } from "../../domain/checkout.js";

/** Domain objects to the contract the web UI validates. */
export function toProductDto(p: Product): ProductDto {
  return {
    productId: p.id,
    title: p.title,
    rating: p.rating,
    image: p.image,
    variants: p.variants.map((v) => ({
      variantId: v.id,
      options: v.options,
      price: v.price?.format(),
      listPrice: v.listPrice?.format(),
      available: v.available,
      url: v.url,
      seller: v.seller,
      shop: v.shop,
    })),
  };
}

const lineDtos = (lines: CartLine[]) =>
  lines.map((l) => ({
    variantId: l.variantId,
    title: l.title,
    image: l.image,
    quantity: l.quantity,
    unitPrice: l.unitPrice?.format(),
    lineTotal: l.lineTotal?.format(),
  }));

export function toCartDto(c: Cart): CartDto {
  return {
    shop: c.shop,
    items: lineDtos(c.lines),
    subtotal: c.subtotal?.format(),
    total: c.total?.format(),
    messages: c.notices,
    continueUrl: c.continueUrl,
  };
}

export function toCheckoutDto(c: Checkout, payableInApp: boolean): CheckoutDto {
  return {
    shop: c.shop,
    items: lineDtos(c.lines),
    subtotal: c.subtotal?.format(),
    total: c.total?.format(),
    messages: c.notices,
    continueUrl: c.continueUrl,
    status: c.status,
    payableInApp,
  };
}

export function toApprovalDto(a: PurchaseApproval): ApprovalDto {
  return {
    id: a.id,
    shop: a.shop,
    items: lineDtos(a.lines),
    total: a.total.format(),
    instruments: a.instruments.map((i) => ({ id: i.id, label: i.label })),
    state: a.state === "approving" ? "pending" : a.state,
    orderId: a.orderId,
    note: a.note,
  };
}
