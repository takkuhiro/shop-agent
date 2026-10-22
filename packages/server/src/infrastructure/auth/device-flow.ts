import { DomainError } from "../../domain/errors.js";
import type { Authenticator, LoginChallenge, LoginPoll, StoredTokens, TokenStore } from "../../domain/ports.js";

const DEVICE_URL = "https://accounts.shop.app/oauth/device";
const TOKEN_URL = "https://accounts.shop.app/oauth/token";
const SCOPE = "openid email personal_agent";
const RESOURCE = "https://mcp.shop.com";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

interface Options {
  /** OAuth client id registered for this app. Without it, sign-in is unavailable. */
  clientId?: string;
  /** Shown to the shopper in their Shop account, so they can recognise this sign-in. */
  deviceName?: string;
  /** Keeps the sign-in across restarts, so the same Shop connection (and its budget) is reused. */
  store?: TokenStore;
  fetch?: typeof fetch;
  now?: () => number;
}

type Tokens = StoredTokens;

/**
 * Shop sign-in with the OAuth device authorization grant (RFC 8628).
 * The shopper approves a short code on accounts.shop.app; this app never sees their password.
 * Tokens are only ever used server-side. With a store they survive restarts: Shop makes a new connection
 * (with its own Shop Pay budget) for every sign-in, so signing in again each time would pile them up.
 */
export class DeviceFlowAuthenticator implements Authenticator {
  private readonly clientId?: string;
  private readonly deviceName: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly store?: TokenStore;
  private memory?: Tokens;
  private refreshing?: Promise<string | undefined>;
  private pending?: { deviceCode: string; expiresAt: number; interval: number; nextPollAt: number };

  constructor(options: Options = {}) {
    this.clientId = options.clientId;
    this.deviceName = options.deviceName ?? "shop-agent";
    this.fetchFn = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.store = options.store;
  }

  /** The store is the truth when there is one: another session may have refreshed the tokens. */
  private get tokens(): Tokens | undefined {
    return this.store ? this.store.load() : this.memory;
  }

  private remember(tokens: Tokens | undefined): void {
    this.memory = tokens;
    if (!this.store) return;
    if (tokens) this.store.save(tokens);
    else this.store.clear();
  }

  get available(): boolean {
    return Boolean(this.clientId);
  }

  get signedIn(): boolean {
    return this.tokens !== undefined;
  }

  async start(): Promise<LoginChallenge> {
    if (!this.clientId) throw new DomainError("Shop sign-in is not configured (SHOP_AUTH_CLIENT_ID is not set)");
    const res = await this.post(DEVICE_URL, {
      client_id: this.clientId,
      scope: SCOPE,
      resource: RESOURCE,
      device_name: this.deviceName,
    });
    if (!res.ok) throw new DomainError(`could not start sign-in: ${res.body.error_description ?? res.body.error ?? res.status}`);
    const body = res.body;
    const interval = Number(body.interval ?? 5);
    this.pending = {
      deviceCode: body.device_code,
      expiresAt: this.now() + Number(body.expires_in ?? 600) * 1000,
      interval,
      nextPollAt: this.now() + interval * 1000,
    };
    return {
      userCode: body.user_code,
      verificationUri: body.verification_uri,
      verificationUriComplete: body.verification_uri_complete,
      expiresIn: Number(body.expires_in ?? 600),
      interval,
    };
  }

  async poll(): Promise<LoginPoll> {
    if (this.tokens) return "signed_in";
    const pending = this.pending;
    if (!pending) return "expired";
    if (this.now() >= pending.expiresAt) {
      this.pending = undefined;
      return "expired";
    }
    // Respect the interval: callers may ask more often than the server allows.
    if (this.now() < pending.nextPollAt) return "pending";

    const res = await this.post(TOKEN_URL, {
      grant_type: DEVICE_GRANT,
      device_code: pending.deviceCode,
      client_id: this.clientId!,
    });
    if (res.ok) {
      this.remember(toTokens(res.body, this.now()));
      this.pending = undefined;
      return "signed_in";
    }
    switch (res.body.error) {
      case "authorization_pending":
        pending.nextPollAt = this.now() + pending.interval * 1000;
        return "pending";
      case "slow_down":
        pending.interval += 5;
        pending.nextPollAt = this.now() + pending.interval * 1000;
        return "pending";
      case "access_denied":
        this.pending = undefined;
        return "denied";
      case "expired_token":
        this.pending = undefined;
        return "expired";
      default:
        throw new DomainError(`sign-in failed: ${res.body.error_description ?? res.body.error ?? res.status}`);
    }
  }

  /** A valid access token, refreshed when it is about to expire. */
  async accessToken(): Promise<string | undefined> {
    const tokens = this.tokens;
    if (!tokens) return undefined;
    if (!this.expiring(tokens)) return tokens.accessToken;
    if (!tokens.refreshToken) {
      this.remember(undefined);
      return undefined;
    }
    // Concurrent requests must share one refresh: Shop rotates the refresh token, so a second use of it fails.
    this.refreshing ??= this.refresh(tokens.refreshToken).finally(() => (this.refreshing = undefined));
    return this.refreshing;
  }

  private expiring(tokens: Tokens): boolean {
    return tokens.expiresAt !== undefined && this.now() > tokens.expiresAt - 60_000;
  }

  private async refresh(refreshToken: string): Promise<string | undefined> {
    const res = await this.post(TOKEN_URL, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: this.clientId! });
    if (res.ok) {
      const next = toTokens({ refresh_token: refreshToken, ...res.body }, this.now());
      this.remember(next);
      return next.accessToken;
    }
    // Another session may have refreshed already, which makes our refresh token stale.
    const latest = this.tokens;
    if (latest && latest.refreshToken !== refreshToken && !this.expiring(latest)) return latest.accessToken;
    // Only a rejection ends the sign-in. A Shop outage must not log the shopper out of a saved connection.
    if (res.status === 400 || res.status === 401) this.remember(undefined);
    return undefined;
  }

  /**
   * Forgets the tokens on this device, as `shop account logout` does. The connection stays in the shopper's
   * Shop account until they remove it there: revoking the refresh token at /oauth/revoke does not remove it.
   */
  signOut(): void {
    this.remember(undefined);
    this.pending = undefined;
  }

  private async post(url: string, form: Record<string, string>) {
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(form),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, any>;
    return { ok: res.ok, status: res.status, body };
  }
}

function toTokens(body: Record<string, any>, now: number): Tokens {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in ? now + Number(body.expires_in) * 1000 : undefined,
  };
}
