import type { Session } from "./session.js";

interface Options {
  /** A session unused for this long is dropped. The Shop sign-in outlives it: it belongs to the shopper, not the session. */
  idleMs?: number;
  now?: () => number;
}

const TWO_HOURS = 2 * 60 * 60 * 1000;

/** The live sessions, in memory. */
export class SessionRegistry {
  private readonly entries = new Map<string, { session: Session; lastUsedAt: number }>();
  private readonly idleMs: number;
  private readonly now: () => number;

  constructor(options: Options = {}) {
    this.idleMs = options.idleMs ?? TWO_HOURS;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  add(session: Session): void {
    this.entries.set(session.id, { session, lastUsedAt: this.now() });
  }

  /** Looking a session up counts as using it. */
  find(id: string): Session | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (this.expired(entry)) {
      this.discard(id);
      return undefined;
    }
    entry.lastUsedAt = this.now();
    return entry.session;
  }

  /** Drops every expired session. Returns how many. */
  sweep(): number {
    let dropped = 0;
    for (const [id, entry] of this.entries) {
      if (this.expired(entry)) {
        this.discard(id);
        dropped++;
      }
    }
    return dropped;
  }

  private expired(entry: { lastUsedAt: number }): boolean {
    return this.now() - entry.lastUsedAt > this.idleMs;
  }

  private discard(id: string): void {
    this.entries.delete(id);
  }
}
