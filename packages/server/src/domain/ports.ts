import type { Cart, LineRequest } from "./cart.js";
import type { Product, SearchCriteria, SearchPage } from "./catalog.js";
import type { Checkout, PaymentInstrument, ShopAccount } from "./checkout.js";
import type { Market } from "./market.js";

/**
 * What the domain needs from the outside world. Infrastructure implements these.
 * The language model is not here: only the agent loop in application/ knows about it.
 */
export interface CatalogGateway {
  search(criteria: SearchCriteria, market: Market): Promise<SearchPage>;
  getProduct(productId: string, selected: { name: string; label: string }[] | undefined, market: Market): Promise<Product>;
}

export interface CartGateway {
  create(shop: string, lines: LineRequest[], market: Market): Promise<Cart>;
  get(shop: string, id: string): Promise<Cart>;
  /** Replaces the cart's lines with exactly these. */
  replaceLines(shop: string, id: string, lines: LineRequest[]): Promise<Cart>;
}

export interface CheckoutGateway {
  createFromCart(shop: string, cartId: string): Promise<Checkout>;
  get(shop: string, id: string): Promise<Checkout>;
  useAccountAddress(shop: string, id: string, account: ShopAccount): Promise<Checkout>;
  /** Pays. Must be called at most once per checkout. */
  complete(shop: string, id: string, instrument: PaymentInstrument): Promise<Checkout>;
}

export interface AccountGateway {
  get(): Promise<ShopAccount>;
}

export interface LoginChallenge {
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
}

export type LoginPoll = "pending" | "signed_in" | "expired" | "denied";

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt?: number;
}

/** Where a sign-in is kept between restarts. Synchronous so that every session sees the latest tokens. */
export interface TokenStore {
  load(): StoredTokens | undefined;
  save(tokens: StoredTokens): void;
  clear(): void;
}

/** The shopper's Shop sign-in. */
export interface Authenticator {
  readonly available: boolean;
  readonly signedIn: boolean;
  start(): Promise<LoginChallenge>;
  poll(): Promise<LoginPoll>;
  /** Forgets the sign-in on this device. The connection stays in the shopper's Shop account until they remove it there. */
  signOut(): void;
}
