import type { ProductDto } from "@shop-agent/contract";

/** The cart button talks to the agent like the shopper would, so every action goes through the same conversation. The hint carries the ids the model must not guess. */
export function addToCartMessage(product: ProductDto, variantIndex: number): { text: string; hint: string } | undefined {
  const variant = product.variants[variantIndex];
  if (!variant) return undefined;
  const options = variant.options ? `（${variant.options}）` : "";
  return {
    text: `「${product.title}」${options}をカートに入れて`,
    hint: `variant_id=${variant.variantId} shop=${variant.shop} quantity=1`,
  };
}
