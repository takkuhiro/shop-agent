import type { Cart, LineRequest } from "../../domain/cart.js";
import type { SearchCriteria } from "../../domain/catalog.js";
import type { Checkout, PaymentInstrument, ShopAccount } from "../../domain/checkout.js";
import { DomainError } from "../../domain/errors.js";
import type { Market } from "../../domain/market.js";
import { Money } from "../../domain/money.js";
import type { AccountGateway, CartGateway, CatalogGateway, CheckoutGateway } from "../../domain/ports.js";
import type { ShopMcp, ToolResult } from "./client.js";
import { stripResponseOnly, toCart, toCheckout, toNotices, toProduct } from "./mappers.js";

type Json = Record<string, any>;

/** Tool-level errors carry the merchant's messages; surface them as domain errors. */
function unwrap(res: ToolResult): Json {
  if (res.isError) {
    const data = res.data as { messages?: unknown } | string;
    throw new DomainError(typeof data === "string" ? data : JSON.stringify(data.messages ?? data));
  }
  return res.data as Json;
}

export class ShopCatalogGateway implements CatalogGateway {
  constructor(private readonly mcp: ShopMcp) {}

  async search(criteria: SearchCriteria, market: Market) {
    const data = unwrap(await this.mcp.callTool("search_catalog", { catalog: searchRequest(criteria, market) }));
    return {
      products: ((data.products as Json[]) ?? []).slice(0, criteria.limit).map(toProduct),
      nextCursor: data.pagination?.has_next_page ? (data.pagination.cursor as string) : undefined,
      notices: toNotices(data.messages),
    };
  }

  async getProduct(productId: string, selected: { name: string; label: string }[] | undefined, market: Market) {
    const data = unwrap(
      await this.mcp.callTool("get_product", {
        catalog: { id: productId, ...(selected && { selected }), context: marketContext(market) },
      }),
    );
    return toProduct(data.product);
  }
}

/** Search and cart must send the same context, or the same product comes back in USD from one and JPY from the other. */
function marketContext(market: Market) {
  return { address_country: market.country, currency: market.currency, language: market.language };
}

/** Maps the shopper's criteria onto the server's filter shape. */
export function searchRequest(c: SearchCriteria, market: Market) {
  const price = (n: number) => Money.fromMajor(n, market.currency).amount;
  const filters: Json = {
    // Always limit to what ships to the shopper's country, instead of relying on context alone.
    ships_to: { country: market.country },
    ...((c.minPrice !== undefined || c.maxPrice !== undefined) && {
      price: {
        ...(c.minPrice !== undefined && { min: price(c.minPrice) }),
        ...(c.maxPrice !== undefined && { max: price(c.maxPrice) }),
      },
    }),
    ...((c.minRating !== undefined || c.minReviewCount !== undefined) && {
      rating: {
        variant: {
          ...(c.minRating !== undefined && { min: c.minRating }),
          ...(c.minReviewCount !== undefined && { min_count: c.minReviewCount }),
        },
      },
    }),
    ...(c.condition && { condition: c.condition }),
    ...(c.shipsFrom && { ships_from: c.shipsFrom.map((country) => ({ country: country.toUpperCase() })) }),
    ...(c.sellers && { shops: c.sellers }),
    ...(c.attributes && { attributes: c.attributes }),
    ...(c.includeUnavailable && { available: false }),
  };
  return {
    ...(c.query && { query: c.query }),
    ...(c.similarTo && { like: c.similarTo.map((id) => ({ id })) }),
    context: marketContext(market),
    filters,
    pagination: { limit: c.limit, ...(c.cursor && { cursor: c.cursor }) },
  };
}

export class ShopCartGateway implements CartGateway {
  constructor(private readonly mcp: ShopMcp) {}

  async create(shop: string, lines: LineRequest[], market: Market): Promise<Cart> {
    const doc = unwrap(
      await this.mcp.callTool("create_cart", {
        shop,
        cart: { line_items: lines.map(toLineItem), context: marketContext(market) },
      }),
    );
    return toCart(shop, doc);
  }

  async get(shop: string, id: string): Promise<Cart> {
    return toCart(shop, unwrap(await this.mcp.callTool("get_cart", { shop, id })));
  }

  /** update_cart replaces the whole document: read it, swap the lines, send it back. */
  async replaceLines(shop: string, id: string, lines: LineRequest[]): Promise<Cart> {
    const doc = stripResponseOnly(unwrap(await this.mcp.callTool("get_cart", { shop, id })));
    const existing: Json[] = doc.line_items ?? [];
    doc.line_items = lines.map((l) => {
      const current = existing.find((e) => e.item?.id === l.variantId);
      return { ...(current ?? toLineItem(l)), quantity: l.quantity };
    });
    return toCart(shop, unwrap(await this.mcp.callTool("update_cart", { shop, id, cart: doc })));
  }
}

function toLineItem(l: LineRequest) {
  return { item: { id: l.variantId }, quantity: l.quantity };
}

export class ShopCheckoutGateway implements CheckoutGateway {
  constructor(private readonly mcp: ShopMcp) {}

  async createFromCart(shop: string, cartId: string): Promise<Checkout> {
    const doc = unwrap(await this.mcp.callTool("create_checkout", { shop, checkout: { cart_id: cartId, line_items: [] } }));
    return toCheckout(shop, doc);
  }

  async get(shop: string, id: string): Promise<Checkout> {
    return toCheckout(shop, unwrap(await this.mcp.callTool("get_checkout", { shop, id })));
  }

  /**
   * Copies the shopper's saved address into the checkout's delivery method (replace-whole-document semantics).
   * If the checkout has no delivery method to fill, it is returned as is.
   */
  async useAccountAddress(shop: string, id: string, account: ShopAccount): Promise<Checkout> {
    const doc = stripResponseOnly(unwrap(await this.mcp.callTool("get_checkout", { shop, id })));
    const address = account.addresses.find((a) => a.id === account.preferredAddressId) ?? account.addresses[0];
    const method = doc.fulfillment?.methods?.[0];
    if (!address || !method) return toCheckout(shop, doc);
    method.destinations = [address.raw];
    method.selected_destination_id = address.id;
    const updated = unwrap(await this.mcp.callTool("update_checkout", { shop, id, checkout: doc }));
    return toCheckout(shop, await this.selectDeliveryOptions(shop, id, updated));
  }

  /** With an address set, each delivery group lists options. Pick the merchant's first one where none is chosen. */
  private async selectDeliveryOptions(shop: string, id: string, doc: Json): Promise<Json> {
    const groups = ((doc.fulfillment?.methods as Json[] | undefined) ?? []).flatMap((m) => (m.groups as Json[] | undefined) ?? []);
    const unchosen = groups.filter((g) => !g.selected_option_id && (g.options as Json[] | undefined)?.length);
    if (unchosen.length === 0) return doc;
    const edited = stripResponseOnly(doc);
    for (const m of edited.fulfillment.methods as Json[]) {
      for (const g of (m.groups as Json[] | undefined) ?? []) {
        if (!g.selected_option_id && (g.options as Json[] | undefined)?.length) g.selected_option_id = g.options[0].id;
      }
    }
    return unwrap(await this.mcp.callTool("update_checkout", { shop, id, checkout: edited }));
  }

  async complete(shop: string, id: string, instrument: PaymentInstrument): Promise<Checkout> {
    const doc = unwrap(
      await this.mcp.callTool("complete_checkout", {
        shop,
        id,
        checkout: { payment: { instruments: [{ ...instrument.raw, selected: true }] } },
      }),
    );
    return toCheckout(shop, doc);
  }
}

export class ShopAccountGateway implements AccountGateway {
  constructor(private readonly mcp: ShopMcp) {}

  async get(): Promise<ShopAccount> {
    const data = unwrap(await this.mcp.callTool("get_account", {}));
    return {
      addresses: ((data.addresses as Json[]) ?? []).map((a) => ({ id: String(a.id), raw: a })),
      preferredAddressId: data.preferred_address_id,
      connection: { payment: data.payment, links: data.links, messages: data.messages },
    };
  }
}
