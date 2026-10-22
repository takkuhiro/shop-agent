import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { ConversationAgent } from "./application/agent/conversation-agent.js";
import type { ChatModel } from "./application/agent/ports.js";
import { buildSystemPrompt } from "./application/agent/prompt.js";
import { AgentToolbox } from "./application/agent/toolbox.js";
import { Session } from "./application/session.js";
import { SessionState } from "./application/session-state.js";
import { SetCartItem, ViewCarts } from "./application/usecases/cart.js";
import { GetProduct, SearchProducts } from "./application/usecases/catalog.js";
import { ApprovePurchase, RequestPurchase, StartCheckout } from "./application/usecases/checkout.js";
import { type Exchange, ExchangeLog } from "./domain/exchange.js";
import type { Market } from "./domain/market.js";
import { AnthropicChatModel } from "./infrastructure/anthropic/chat-model.js";
import { DeviceFlowAuthenticator } from "./infrastructure/auth/device-flow.js";
import { FileTokenStore } from "./infrastructure/auth/file-token-store.js";
import { HttpShopMcp, type ShopMcp } from "./infrastructure/shop/client.js";
import { ShopAccountGateway, ShopCartGateway, ShopCatalogGateway, ShopCheckoutGateway } from "./infrastructure/shop/gateways.js";
import { RetryingShopMcp } from "./infrastructure/shop/retrying-mcp.js";

export interface Config {
  market: Market;
  model: string;
  shopClientId?: string;
  /** Where the Shop sign-in is kept between restarts. Without it, sign-in lasts until the server stops. */
  tokenFile?: string;
  anthropicApiKey?: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv): Config {
  return {
    market: {
      country: env.SHOP_COUNTRY ?? "JP",
      currency: env.SHOP_CURRENCY ?? "JPY",
      language: env.SHOP_LANGUAGE ?? "ja",
    },
    model: env.SHOP_AGENT_MODEL ?? "claude-opus-5-5",
    shopClientId: env.SHOP_AUTH_CLIENT_ID || undefined,
    tokenFile: env.SHOP_TOKEN_FILE || undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
  };
}

/** Builds a Session with all its collaborators. The only place that knows the concrete classes. */
export class SessionFactory {
  constructor(
    private readonly config: Config,
    private readonly chatModel: ChatModel = new AnthropicChatModel({ client: new Anthropic(), model: config.model }),
    private readonly makeMcp = (accessToken: () => Promise<string | undefined>, onExchange: (e: Exchange) => void): ShopMcp =>
      new RetryingShopMcp(new HttpShopMcp({ accessToken, onExchange })),
  ) {}

  create(): Session {
    const { market } = this.config;
    const auth = new DeviceFlowAuthenticator({
      clientId: this.config.shopClientId,
      store: this.config.tokenFile ? new FileTokenStore(this.config.tokenFile) : undefined,
    });
    const exchanges = new ExchangeLog();
    const mcp = this.makeMcp(
      () => auth.accessToken(),
      (e) => exchanges.record(e),
    );
    const state = new SessionState();
    const catalog = new ShopCatalogGateway(mcp);
    const carts = new ShopCartGateway(mcp);
    const checkouts = new ShopCheckoutGateway(mcp);
    const account = new ShopAccountGateway(mcp);

    const approvePurchase = new ApprovePurchase(checkouts, state);
    const toolbox = new AgentToolbox({
      searchProducts: new SearchProducts(catalog, market),
      getProduct: new GetProduct(catalog, market),
      setCartItem: new SetCartItem(carts, state, market),
      viewCarts: new ViewCarts(carts, state),
      startCheckout: new StartCheckout(checkouts, account, auth, state),
      requestPurchase: new RequestPurchase(checkouts, auth, state),
      approvePurchase,
      auth,
      state,
      exchanges,
    });
    const agent = new ConversationAgent({ model: this.chatModel, tools: toolbox, systemPrompt: buildSystemPrompt(market) });
    return new Session(randomUUID(), market, agent, auth, state, approvePurchase, account);
  }
}
