import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../src/domain/errors.js";
import type { StoredTokens, TokenStore } from "../src/domain/ports.js";
import { DeviceFlowAuthenticator } from "../src/infrastructure/auth/device-flow.js";

function scripted(responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; form: URLSearchParams }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), form: init!.body as URLSearchParams });
    const r = responses.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  return { calls, fetchFn };
}

const challenge = {
  device_code: "dc",
  user_code: "ABCD-1234",
  verification_uri: "https://accounts.shop.app/device",
  verification_uri_complete: "https://accounts.shop.app/device?c=ABCD-1234",
  expires_in: 600,
  interval: 5,
};

describe("DeviceFlowAuthenticator", () => {
  it("is unavailable without a client id", async () => {
    const auth = new DeviceFlowAuthenticator({});
    expect(auth.available).toBe(false);
    await expect(auth.start()).rejects.toBeInstanceOf(DomainError);
  });

  it("starts the device flow with the documented scope, resource and a device name", async () => {
    const { calls, fetchFn } = scripted([{ body: challenge }]);
    const auth = new DeviceFlowAuthenticator({ clientId: "cid", deviceName: "my laptop", fetch: fetchFn });
    const out = await auth.start();
    expect(calls[0].url).toBe("https://accounts.shop.app/oauth/device");
    expect(calls[0].form.get("client_id")).toBe("cid");
    expect(calls[0].form.get("scope")).toBe("openid email personal_agent");
    expect(calls[0].form.get("resource")).toBe("https://mcp.shop.com");
    expect(calls[0].form.get("device_name")).toBe("my laptop");
    expect(out.userCode).toBe("ABCD-1234");
    expect(out.verificationUriComplete).toContain("ABCD-1234");
  });

  it("does not poll the server faster than the interval", async () => {
    let now = 0;
    const { fetchFn } = scripted([{ body: challenge }]);
    const auth = new DeviceFlowAuthenticator({ clientId: "cid", fetch: fetchFn, now: () => now });
    await auth.start();
    now = 1000;
    expect(await auth.poll()).toBe("pending");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("keeps pending while the shopper has not approved, and signs in once they do", async () => {
    let now = 0;
    const { calls, fetchFn } = scripted([
      { body: challenge },
      { status: 400, body: { error: "authorization_pending" } },
      { body: { access_token: "at", refresh_token: "rt", expires_in: 3600 } },
    ]);
    const auth = new DeviceFlowAuthenticator({ clientId: "cid", fetch: fetchFn, now: () => now });
    await auth.start();
    now = 6000;
    expect(await auth.poll()).toBe("pending");
    now = 12000;
    expect(await auth.poll()).toBe("signed_in");
    expect(auth.signedIn).toBe(true);
    expect(calls[2].form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
    expect(calls[2].form.get("device_code")).toBe("dc");
    expect(await auth.accessToken()).toBe("at");
  });

  it("slows down when asked", async () => {
    let now = 0;
    const { fetchFn } = scripted([{ body: challenge }, { status: 400, body: { error: "slow_down" } }]);
    const auth = new DeviceFlowAuthenticator({ clientId: "cid", fetch: fetchFn, now: () => now });
    await auth.start();
    now = 6000;
    await auth.poll();
    now = 12000; // 6s after: interval is now 10s, so no new request
    expect(await auth.poll()).toBe("pending");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("reports denial and expiry", async () => {
    let now = 0;
    const denied = scripted([{ body: challenge }, { status: 400, body: { error: "access_denied" } }]);
    const a = new DeviceFlowAuthenticator({ clientId: "cid", fetch: denied.fetchFn, now: () => now });
    await a.start();
    now = 6000;
    expect(await a.poll()).toBe("denied");

    const expired = scripted([{ body: challenge }]);
    const b = new DeviceFlowAuthenticator({ clientId: "cid", fetch: expired.fetchFn, now: () => now });
    await b.start();
    now = 6000 + 601_000;
    expect(await b.poll()).toBe("expired");
  });

  it("refreshes an expiring token and signs out when refresh fails", async () => {
    let now = 0;
    const { calls, fetchFn } = scripted([
      { body: challenge },
      { body: { access_token: "at1", refresh_token: "rt", expires_in: 100 } },
      { body: { access_token: "at2", expires_in: 3600 } },
      { status: 400, body: { error: "invalid_grant" } },
    ]);
    const auth = new DeviceFlowAuthenticator({ clientId: "cid", fetch: fetchFn, now: () => now });
    await auth.start();
    now = 6000;
    await auth.poll();
    now = 60_000; // within 60s of expiry (106s)
    expect(await auth.accessToken()).toBe("at2");
    expect(calls[2].form.get("grant_type")).toBe("refresh_token");
    now = 60_000 + 3_600_000;
    expect(await auth.accessToken()).toBeUndefined();
    expect(auth.signedIn).toBe(false);
  });

  async function signedInAuth(responses: { status?: number; body: unknown }[]) {
    const { calls, fetchFn } = scripted([
      { body: challenge },
      { body: { access_token: "at", refresh_token: "rt", expires_in: 3600 } },
      ...responses,
    ]);
    let now = 0;
    const auth = new DeviceFlowAuthenticator({ clientId: "cid", fetch: fetchFn, now: () => now });
    await auth.start();
    now = 6000;
    await auth.poll();
    return { auth, calls };
  }

  it("forgets the tokens when signing out, without calling Shop (the connection stays until the shopper removes it)", async () => {
    const { auth, calls } = await signedInAuth([]);
    await auth.signOut();
    expect(auth.signedIn).toBe(false);
    expect(calls).toHaveLength(2); // device + token only
  });
});

class MemoryStore implements TokenStore {
  saved?: StoredTokens;
  load() {
    return this.saved;
  }
  save(tokens: StoredTokens) {
    this.saved = tokens;
  }
  clear() {
    this.saved = undefined;
  }
}

describe("DeviceFlowAuthenticator with a token store", () => {
  const tokenBody = (n: number, expiresIn = 3600) => ({ access_token: `at${n}`, refresh_token: `rt${n}`, expires_in: expiresIn });

  async function signIn(store: TokenStore, responses: { status?: number; body: unknown }[] = []) {
    const { calls, fetchFn } = scripted([{ body: challenge }, { body: tokenBody(1) }, ...responses]);
    let now = 0;
    const auth = new DeviceFlowAuthenticator({ clientId: "cid", fetch: fetchFn, now: () => now, store });
    await auth.start();
    now = 6000;
    await auth.poll();
    return { auth, calls, fetchFn, setNow: (t: number) => (now = t) };
  }

  it("saves the tokens on sign-in, so a new process is signed in without the device flow", async () => {
    const store = new MemoryStore();
    await signIn(store);
    expect(store.saved?.refreshToken).toBe("rt1");

    const { fetchFn } = scripted([]);
    const restarted = new DeviceFlowAuthenticator({ clientId: "cid", fetch: fetchFn, store, now: () => 6000 });
    expect(restarted.signedIn).toBe(true);
    expect(await restarted.accessToken()).toBe("at1");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("saves the rotated refresh token every time it refreshes", async () => {
    const store = new MemoryStore();
    const { auth, calls, setNow } = await signIn(store, [{ body: tokenBody(2) }]);
    setNow(3_600_000);
    expect(await auth.accessToken()).toBe("at2");
    expect(calls[2].form.get("refresh_token")).toBe("rt1");
    expect(store.saved).toMatchObject({ accessToken: "at2", refreshToken: "rt2" });
  });

  it("signing out clears the saved tokens", async () => {
    const store = new MemoryStore();
    const { auth } = await signIn(store);
    await auth.signOut();
    expect(store.saved).toBeUndefined();
    expect(auth.signedIn).toBe(false);
  });

  it("keeps the saved tokens when Shop is temporarily unavailable during a refresh", async () => {
    const store = new MemoryStore();
    const { auth, setNow } = await signIn(store, [{ status: 503, body: {} }]);
    setNow(3_600_000);
    expect(await auth.accessToken()).toBeUndefined();
    expect(store.saved?.refreshToken).toBe("rt1");
    expect(auth.signedIn).toBe(true);
  });

  it("clears the saved tokens when Shop rejects the refresh token", async () => {
    const store = new MemoryStore();
    const { auth, setNow } = await signIn(store, [{ status: 400, body: { error: "invalid_grant" } }]);
    setNow(3_600_000);
    expect(await auth.accessToken()).toBeUndefined();
    expect(store.saved).toBeUndefined();
    expect(auth.signedIn).toBe(false);
  });

  it("uses tokens another session refreshed in the meantime instead of signing out", async () => {
    const store = new MemoryStore();
    const { auth, setNow } = await signIn(store, [{ status: 400, body: { error: "invalid_grant" } }]);
    setNow(3_600_000);
    // The other session refreshed first; Shop already rotated rt1 away.
    store.saved = { accessToken: "at9", refreshToken: "rt9", expiresAt: 7_200_000 };
    expect(await auth.accessToken()).toBe("at9");
    expect(store.saved.refreshToken).toBe("rt9");
  });

  it("refreshes once when several requests find the token expired at the same time", async () => {
    const store = new MemoryStore();
    const { auth, calls, setNow } = await signIn(store, [{ body: tokenBody(2) }]);
    setNow(3_600_000);
    const tokens = await Promise.all([auth.accessToken(), auth.accessToken(), auth.accessToken()]);
    expect(tokens).toEqual(["at2", "at2", "at2"]);
    expect(calls.filter((c) => c.form.get("grant_type") === "refresh_token")).toHaveLength(1);
  });
});
