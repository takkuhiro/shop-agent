import { describe, expect, it } from "vitest";
import type { Session } from "../../src/application/session.js";
import { SessionRegistry } from "../../src/application/session-registry.js";

function fakeSession(id: string) {
  const session = {
    id,
    auth: {
      signedOut: false,
      async signOut() {
        this.signedOut = true;
      },
    },
  };
  return session as unknown as Session & { auth: { signedOut: boolean } };
}

const MINUTE = 60_000;

describe("SessionRegistry", () => {
  it("finds a session that was added", () => {
    const registry = new SessionRegistry({ idleMs: 10 * MINUTE, now: () => 0 });
    registry.add(fakeSession("a"));
    expect(registry.find("a")?.id).toBe("a");
    expect(registry.find("zzz")).toBeUndefined();
  });

  it("does not return a session that has been idle too long, and leaves the Shop sign-in alone", () => {
    let now = 0;
    const registry = new SessionRegistry({ idleMs: 10 * MINUTE, now: () => now });
    const session = fakeSession("a");
    registry.add(session);
    now = 10 * MINUTE + 1;
    expect(registry.find("a")).toBeUndefined();
    expect(session.auth.signedOut).toBe(false);
  });

  it("counts each use as activity", () => {
    let now = 0;
    const registry = new SessionRegistry({ idleMs: 10 * MINUTE, now: () => now });
    registry.add(fakeSession("a"));
    now = 9 * MINUTE;
    expect(registry.find("a")).toBeDefined();
    now = 18 * MINUTE;
    expect(registry.find("a")).toBeDefined();
  });

  it("sweeps expired sessions and keeps active ones", () => {
    let now = 0;
    const registry = new SessionRegistry({ idleMs: 10 * MINUTE, now: () => now });
    const old = fakeSession("old");
    registry.add(old);
    now = 8 * MINUTE;
    registry.add(fakeSession("fresh"));
    now = 12 * MINUTE;
    expect(registry.sweep()).toBe(1);
    expect(old.auth.signedOut).toBe(false);
    expect(registry.size).toBe(1);
    expect(registry.find("fresh")).toBeDefined();
  });
});
