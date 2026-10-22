import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileTokenStore } from "../src/infrastructure/auth/file-token-store.js";

describe("FileTokenStore", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "token-store-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const tokens = { accessToken: "at", refreshToken: "rt", expiresAt: 123 };

  it("returns nothing before anything is saved", () => {
    expect(new FileTokenStore(join(dir, "t.json")).load()).toBeUndefined();
  });

  it("gives back what was saved, also to a new instance", () => {
    const file = join(dir, "nested", "t.json");
    new FileTokenStore(file).save(tokens);
    expect(new FileTokenStore(file).load()).toEqual(tokens);
  });

  it("lets only the owner read the file", () => {
    const file = join(dir, "t.json");
    new FileTokenStore(file).save(tokens);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("keeps the file private when it overwrites it", () => {
    const file = join(dir, "t.json");
    const store = new FileTokenStore(file);
    store.save(tokens);
    store.save({ ...tokens, accessToken: "at2" });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(store.load()?.accessToken).toBe("at2");
  });

  it("forgets the tokens on clear, and clearing nothing is fine", () => {
    const store = new FileTokenStore(join(dir, "t.json"));
    store.clear();
    store.save(tokens);
    store.clear();
    expect(store.load()).toBeUndefined();
  });

  it("treats a damaged file as signed out", () => {
    const file = join(dir, "t.json");
    writeFileSync(file, "{not json");
    expect(new FileTokenStore(file).load()).toBeUndefined();
    writeFileSync(file, JSON.stringify({ refreshToken: "only" }));
    expect(new FileTokenStore(file).load()).toBeUndefined();
  });
});
