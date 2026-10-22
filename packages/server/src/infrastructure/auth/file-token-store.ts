import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { StoredTokens, TokenStore } from "../../domain/ports.js";

/**
 * Keeps the Shop sign-in in a file only its owner can read, like Shop's own CLI does.
 * The file is not encrypted: treat it like a password.
 */
export class FileTokenStore implements TokenStore {
  constructor(private readonly path: string) {}

  load(): StoredTokens | undefined {
    try {
      const data = JSON.parse(readFileSync(this.path, "utf8")) as Partial<StoredTokens>;
      if (typeof data.accessToken !== "string") return undefined;
      return {
        accessToken: data.accessToken,
        refreshToken: typeof data.refreshToken === "string" ? data.refreshToken : undefined,
        expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : undefined,
      };
    } catch {
      return undefined;
    }
  }

  save(tokens: StoredTokens): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    // Write beside the target and rename, so a crash never leaves half a file where the tokens were.
    const temp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(tokens), { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, this.path);
  }

  clear(): void {
    rmSync(this.path, { force: true });
  }
}
