import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("styles.css", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

  it("does not size every image inside a card, which stretched the checkout thumbnails", () => {
    expect(css).not.toMatch(/\.card\s+img/);
  });

  it("keeps the thumbnail and product image rules separate", () => {
    expect(css).toMatch(/^\.thumb\s*\{[^}]*width:\s*48px/m);
    expect(css).toMatch(/^\.product-image\s*\{[^}]*width:\s*100%/m);
  });
});
