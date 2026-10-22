import type { SessionDto } from "@shop-agent/contract";

const KEY = "shop-agent.sessionId";

interface Deps {
  /** Per-tab storage. Reading or writing may throw (private windows, blocked storage); the app then simply starts fresh. */
  storage?: Pick<Storage, "getItem" | "setItem">;
  get(id: string): Promise<SessionDto>;
  create(): Promise<SessionDto>;
}

/** Goes back to this tab's earlier session if the server still has it, otherwise starts a new one. */
export async function openSession({ storage, get, create }: Deps): Promise<{ session: SessionDto; resumed: boolean }> {
  const saved = read(storage);
  if (saved) {
    try {
      return { session: await get(saved), resumed: true };
    } catch {
      // The server dropped it (idle too long or restarted): fall through to a new session.
    }
  }
  const session = await create();
  try {
    storage?.setItem(KEY, session.sessionId);
  } catch {
    // Not being able to remember the session only costs the resume on reload.
  }
  return { session, resumed: false };
}

function read(storage: Deps["storage"]): string | null {
  try {
    return storage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}
