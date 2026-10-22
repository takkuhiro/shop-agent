import { describe, expect, it } from "vitest";
import { toCartDto } from "../src/application/views/ui-view.js";
import { toCart, toCheckout } from "../src/infrastructure/shop/mappers.js";

const doc = {
  id: "cart1",
  currency: "JPY",
  line_items: [
    {
      quantity: 1,
      item: { id: "v1", title: "Mug", price: 660, image_url: "https://cdn.example/mug.jpg" },
      totals: [{ type: "total", amount: 660 }],
    },
    { quantity: 2, item: { id: "v2", title: "Plate", price: 100 }, totals: [{ type: "total", amount: 200 }] },
  ],
  totals: [{ type: "total", amount: 860 }],
  messages: [],
};

describe("cart mapping", () => {
  it("keeps each line's image and shows it in the UI view", () => {
    const dto = toCartDto(toCart("s.myshopify.com", doc));
    expect(dto.items[0]!.image).toBe("https://cdn.example/mug.jpg");
    expect(dto.items[1]!.image).toBeUndefined();
  });
});

describe("checkout instruments", () => {
  const checkoutDoc = (instruments: unknown[]) => ({
    id: "co1",
    currency: "JPY",
    status: "ready_for_complete",
    line_items: [],
    totals: [],
    messages: [],
    payment: { instruments },
  });

  it("names the agent budget by what is left of it", () => {
    const [budget] = toCheckout(
      "s.myshopify.com",
      checkoutDoc([{ id: "b", type: "delegated_budget", handler_id: "shop_pay", display: { remaining_amount: 2000, limit: 2000 } }]),
    ).instruments;
    expect(budget!.label).toBe("エージェント用の予算（残り ¥2,000）");
  });

  it("names a saved card by brand and last digits", () => {
    const [card] = toCheckout(
      "s.myshopify.com",
      checkoutDoc([{ id: "c", type: "shop_pay", display: { brand: "visa", last_digits: "4242" } }]),
    ).instruments;
    expect(card!.label).toBe("visa •••• 4242");
  });
});
