import type { ChatEvent } from "@shop-agent/contract";
import { z } from "zod";
import { AuthRequiredError, DomainError } from "../../domain/errors.js";
import type { Exchange, ExchangeLog } from "../../domain/exchange.js";
import type { Authenticator } from "../../domain/ports.js";
import type { SessionState } from "../session-state.js";
import type { SetCartItem, ViewCarts } from "../usecases/cart.js";
import type { GetProduct, SearchProducts } from "../usecases/catalog.js";
import type { ApprovePurchase, RequestPurchase, StartCheckout } from "../usecases/checkout.js";
import { cartForModel, checkoutForModel, productForModel } from "../views/model-view.js";
import { toApprovalDto, toCartDto, toCheckoutDto, toProductDto } from "../views/ui-view.js";
import type { ToolSpec } from "./ports.js";

export interface ToolResult {
  /** What the model reads. */
  content: string;
  isError: boolean;
  /** What the shopper's screen should show. Never sent to the model. */
  events: ChatEvent[];
  /** The HTTP requests this call made to the Shop MCP server. */
  exchanges: Exchange[];
}

const Search = z
  .object({
    query: z.string().min(1).optional().describe("Search text in the shopper's words, e.g. 'ceramic coffee mug'"),
    similar_to: z
      .array(z.string())
      .min(1)
      .max(2)
      .optional()
      .describe("1-2 product_id or variant_id from earlier results, to find similar items. query is optional with this."),
    max_price: z.number().min(0).optional().describe("Upper price bound in the shopper's currency, as a whole amount (5000 for 5000 yen)"),
    min_price: z.number().min(0).optional().describe("Lower price bound in the shopper's currency"),
    min_rating: z.number().min(0).max(5).optional().describe("Minimum rating, 0-5"),
    min_review_count: z.number().int().min(0).optional().describe("Minimum number of reviews; use with min_rating"),
    condition: z.array(z.enum(["new", "secondhand"])).optional(),
    ships_from: z.array(z.string().length(2)).optional().describe("Origin country codes, e.g. ['JP'] for domestic sellers"),
    sellers: z.array(z.string()).optional().describe("Restrict to these seller shop domains"),
    attributes: z
      .array(z.object({ name: z.enum(["Color", "Size", "Target gender"]), values: z.array(z.string()).min(1) }))
      .optional()
      .describe("Attribute filters. ANDed across attributes, ORed within one."),
    include_unavailable: z.boolean().optional().describe("Also return sold-out items. Default false."),
    limit: z.number().int().min(1).max(30).default(8).describe("Products per page, 1-30 (default 8)"),
    cursor: z.string().optional().describe("next_cursor from the previous page. Repeat the same query and options with it."),
  })
  .refine((v) => v.query || v.similar_to, { message: "query or similar_to is required" });

const GetProductInput = z.object({
  product_id: z.string(),
  selected: z
    .array(z.object({ name: z.string(), label: z.string() }))
    .optional()
    .describe("Option name and label pairs exactly as returned by search"),
});
const SetCartItemInput = z.object({
  shop: z.string().describe("The variant's shop domain from search results"),
  variant_id: z.string().describe("Exact variant_id, copied unchanged"),
  quantity: z.number().int().min(0).max(99).describe("Absolute quantity; 0 removes the item"),
});
const ShopInput = z.object({ shop: z.string() });
const Empty = z.object({});

/** What a tool produces itself; the toolbox adds the exchanges. */
type ToolOutcome = Omit<ToolResult, "exchanges">;

interface Tool {
  description: string;
  schema: z.ZodType;
  run(input: any): Promise<ToolOutcome>;
}

export interface ToolboxDeps {
  searchProducts: SearchProducts;
  getProduct: GetProduct;
  setCartItem: SetCartItem;
  viewCarts: ViewCarts;
  startCheckout: StartCheckout;
  requestPurchase: RequestPurchase;
  approvePurchase: ApprovePurchase;
  auth: Authenticator;
  state: SessionState;
  exchanges: ExchangeLog;
}

/** The tools the model may call. Each one is a thin adapter over a use case. */
export class AgentToolbox {
  private readonly tools: Record<string, Tool>;

  constructor(private readonly deps: ToolboxDeps) {
    this.tools = {
      search_products: {
        description:
          "Search Shopify's catalog. Results are limited to items that ship to the shopper's country and priced in their currency. Each product lists variants with variant_id, price, availability and the seller's shop domain.",
        schema: Search,
        run: (i: z.infer<typeof Search>) => this.search(i),
      },
      get_product: {
        description: "Get details for one product, or check another option combination (e.g. a different size).",
        schema: GetProductInput,
        run: (i: z.infer<typeof GetProductInput>) => this.getProduct(i),
      },
      set_cart_item: {
        description:
          "Add a variant to the cart or change its quantity (0 removes it). Carts are per merchant, so pass the variant's shop domain. Call only when the shopper asks to add or change items.",
        schema: SetCartItemInput,
        run: (i: z.infer<typeof SetCartItemInput>) => this.setCartItem(i),
      },
      view_carts: {
        description: "Show every cart in this conversation (one per merchant) with current items and totals.",
        schema: Empty,
        run: () => this.viewCarts(),
      },
      start_checkout: {
        description:
          "Turn a merchant's cart into a checkout and return its status, totals, messages and continue_url. Call only when the shopper asks to check out.",
        schema: ShopInput,
        run: (i: z.infer<typeof ShopInput>) => this.startCheckout(i.shop),
      },
      request_purchase: {
        description:
          "Show the shopper an approval card to pay for a ready checkout in this app. Needs a signed-in shopper and a checkout from start_checkout with payable_in_app true. You cannot pay; the shopper decides on the card.",
        schema: ShopInput,
        run: (i: z.infer<typeof ShopInput>) => this.requestPurchase(i.shop),
      },
      request_login: {
        description: "Show the shopper a Shop sign-in card. Use it when they want to pay in this app but are not signed in.",
        schema: Empty,
        run: () => this.requestLogin(),
      },
    };
  }

  get specs(): ToolSpec[] {
    return Object.entries(this.tools).map(([name, tool]) => {
      const { $schema, ...inputSchema } = z.toJSONSchema(tool.schema, { io: "input" }) as Record<string, unknown>;
      return { name, description: tool.description, inputSchema };
    });
  }

  async run(name: string, input: unknown): Promise<ToolResult> {
    this.deps.exchanges.drain();
    const result = await this.execute(name, input);
    return { ...result, exchanges: this.deps.exchanges.drain() };
  }

  private async execute(name: string, input: unknown): Promise<ToolOutcome> {
    const tool = this.tools[name];
    if (!tool) return fail(`unknown tool: ${name}`);
    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) return fail(`invalid input: ${parsed.error.message}`);
    try {
      return await tool.run(parsed.data);
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        return {
          content: "Shop sign-in is required for this. Tell the shopper, and call request_login to show the sign-in card.",
          isError: true,
          events: [{ type: "auth_required", reason: "この操作にはShopへのサインインが必要です。" }],
        };
      }
      return fail(error instanceof Error ? error.message : String(error));
    }
  }

  private async search(input: z.infer<typeof Search>): Promise<ToolOutcome> {
    const page = await this.deps.searchProducts.execute({
      query: input.query,
      similarTo: input.similar_to,
      minPrice: input.min_price,
      maxPrice: input.max_price,
      minRating: input.min_rating,
      minReviewCount: input.min_review_count,
      condition: input.condition,
      shipsFrom: input.ships_from,
      sellers: input.sellers,
      attributes: input.attributes,
      includeUnavailable: input.include_unavailable,
      limit: input.limit,
      cursor: input.cursor,
    });
    return {
      content: JSON.stringify({
        products: page.products.map(productForModel),
        next_cursor: page.nextCursor,
        messages: page.notices,
      }),
      isError: false,
      events: [{ type: "products", products: page.products.map(toProductDto) }],
    };
  }

  private async getProduct(input: z.infer<typeof GetProductInput>): Promise<ToolOutcome> {
    const product = await this.deps.getProduct.execute(input.product_id, input.selected);
    return {
      content: JSON.stringify(productForModel(product)),
      isError: false,
      events: [{ type: "products", products: [toProductDto(product)] }],
    };
  }

  private async setCartItem(input: z.infer<typeof SetCartItemInput>): Promise<ToolOutcome> {
    const cart = await this.deps.setCartItem.execute(input.shop, input.variant_id, input.quantity);
    return { content: JSON.stringify(cartForModel(cart)), isError: false, events: [this.cartsEvent()] };
  }

  private async viewCarts(): Promise<ToolOutcome> {
    const carts = await this.deps.viewCarts.execute();
    return { content: JSON.stringify({ carts: carts.map(cartForModel) }), isError: false, events: [this.cartsEvent()] };
  }

  private cartsEvent(): ChatEvent {
    return { type: "carts", carts: this.deps.state.cartSnapshots().map(toCartDto) };
  }

  private async startCheckout(shop: string): Promise<ToolOutcome> {
    const { checkout, signedIn, payableInApp } = await this.deps.startCheckout.execute(shop);
    const events: ChatEvent[] = [{ type: "checkout", checkout: toCheckoutDto(checkout, payableInApp) }];
    if (!signedIn) events.push({ type: "auth_required", reason: "このアプリで支払うにはShopにサインインしてください。" });
    return { content: JSON.stringify(checkoutForModel(checkout, signedIn, payableInApp)), isError: false, events };
  }

  private async requestPurchase(shop: string): Promise<ToolOutcome> {
    if (!this.deps.auth.signedIn) {
      return {
        content: "The shopper is not signed in to Shop. Call request_login, or give them the continue_url.",
        isError: true,
        events: [{ type: "auth_required", reason: "このアプリで支払うにはShopにサインインしてください。" }],
      };
    }
    const approval = await this.deps.requestPurchase.execute(shop);
    return {
      content: "An approval card is now shown to the shopper. Wait for their decision. Do not say the order is placed.",
      isError: false,
      events: [{ type: "approval", approval: toApprovalDto(approval) }],
    };
  }

  private async requestLogin(): Promise<ToolOutcome> {
    if (!this.deps.auth.available) {
      return fail("Shop sign-in is not configured in this app. Give the shopper the continue_url instead.");
    }
    if (this.deps.auth.signedIn) return { content: "The shopper is already signed in.", isError: false, events: [] };
    return {
      content: "A sign-in card is now shown to the shopper. Wait until they say they are signed in.",
      isError: false,
      events: [{ type: "auth_required", reason: "このアプリで支払うにはShopにサインインしてください。" }],
    };
  }
}

function fail(message: string): ToolOutcome {
  return { content: message, isError: true, events: [] };
}

export { DomainError };
