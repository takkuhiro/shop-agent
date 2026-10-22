import type { Cart, CartLine } from "../../domain/cart.js";
import type { Notice, Product } from "../../domain/catalog.js";
import type { Checkout, PaymentInstrument } from "../../domain/checkout.js";
import { Money } from "../../domain/money.js";

type Json = Record<string, any>;

function money(amount: unknown, currency: unknown): Money | undefined {
  return typeof amount === "number" && typeof currency === "string" ? new Money(amount, currency) : undefined;
}

export function toNotices(messages: unknown): Notice[] {
  return ((messages as Json[] | undefined) ?? []).map((m) => ({
    type: String(m.type),
    code: m.code,
    content: String(m.content ?? ""),
    severity: m.severity,
  }));
}

export function toProduct(raw: Json): Product {
  const image = raw.media?.[0]?.url ?? raw.variants?.find((v: Json) => v.media?.[0])?.media[0].url;
  return {
    id: raw.id,
    title: raw.title,
    rating: raw.rating ? `${raw.rating.value}/5 (${raw.rating.count} reviews)` : undefined,
    image,
    options: Object.fromEntries((raw.options ?? []).map((o: Json) => [o.name, (o.values ?? []).map((v: Json) => v.label)])),
    variants: (raw.variants ?? []).map((v: Json) => ({
      id: v.id,
      options: (v.options ?? []).map((o: Json) => `${o.name}: ${o.label}`).join(" / "),
      price: money(v.price?.amount, v.price?.currency),
      listPrice: money(v.list_price?.amount, v.list_price?.currency),
      available: v.availability?.available,
      url: v.url,
      seller: v.seller?.name,
      shop: v.seller?.domain,
    })),
  };
}

function toLines(doc: Json): CartLine[] {
  const currency = doc.currency;
  return (doc.line_items ?? []).map((l: Json) => ({
    variantId: l.item?.id,
    title: l.item?.title,
    image: l.item?.image_url,
    quantity: l.quantity,
    unitPrice: money(l.item?.price, currency),
    lineTotal: money(l.totals?.find((t: Json) => t.type === "total")?.amount, currency),
  }));
}

function totalOf(doc: Json, type: string): Money | undefined {
  return money(doc.totals?.find((t: Json) => t.type === type)?.amount, doc.currency);
}

export function toCart(shop: string, doc: Json): Cart {
  return {
    shop,
    id: doc.id,
    lines: toLines(doc),
    subtotal: totalOf(doc, "subtotal"),
    total: totalOf(doc, "total"),
    notices: toNotices(doc.messages),
    continueUrl: doc.continue_url,
  };
}

/** The budget is labelled by what is left, because that is what the shopper decides on. Saved cards by brand and last digits. */
function toInstrument(currency: string, raw: Json): PaymentInstrument {
  const display = raw.display as Json | undefined;
  if (raw.type === "delegated_budget" && typeof display?.remaining_amount === "number") {
    const left = new Money(display.remaining_amount, currency).format();
    return { id: String(raw.id), label: `エージェント用の予算（残り ${left}）`, raw };
  }
  const parts = [display?.brand, display?.last_digits && `•••• ${display.last_digits}`, display?.label, display?.name]
    .filter(Boolean)
    .map(String);
  return {
    id: String(raw.id),
    label: parts.length > 0 ? parts.join(" ") : String(raw.handler_id ?? raw.type ?? raw.id),
    raw,
  };
}

export function toCheckout(shop: string, doc: Json): Checkout {
  const notices = toNotices(doc.messages);
  const order = doc.order as Json | undefined;
  return {
    shop,
    id: doc.id,
    status: doc.status,
    lines: toLines(doc),
    subtotal: totalOf(doc, "subtotal"),
    total: totalOf(doc, "total"),
    notices,
    continueUrl: doc.continue_url,
    instruments: ((doc.payment?.instruments as Json[] | undefined) ?? []).map((i) => toInstrument(doc.currency, i)),
    orderId: order ? String(order.id ?? order.number ?? order.order_number ?? "") || undefined : undefined,
    deliveryMissing: notices.some((n) => n.code === "delivery_address_required"),
  };
}

/** Fields that only exist on responses and must not be sent back in an update. */
export function stripResponseOnly(doc: Json): Json {
  const { next, signals, attribution, ...rest } = doc;
  return rest;
}
