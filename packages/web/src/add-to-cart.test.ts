import type { ProductDto } from "@shop-agent/contract";
import { describe, expect, it } from "vitest";
import { addToCartMessage } from "./add-to-cart";

const product = {
  productId: "p1",
  title: "マグ",
  variants: [
    { variantId: "v1", options: "色: 白", shop: "a.myshopify.com" },
    { variantId: "v2", options: "", shop: "a.myshopify.com" },
  ],
} as ProductDto;

describe("addToCartMessage", () => {
  it("names the product and variant and hands over the ids as a hint", () => {
    expect(addToCartMessage(product, 0)).toEqual({
      text: "「マグ」（色: 白）をカートに入れて",
      hint: "variant_id=v1 shop=a.myshopify.com quantity=1",
    });
  });

  it("leaves out the options when the variant has none", () => {
    expect(addToCartMessage(product, 1)?.text).toBe("「マグ」をカートに入れて");
  });

  it("returns nothing for a variant that does not exist", () => {
    expect(addToCartMessage(product, 9)).toBeUndefined();
  });
});
