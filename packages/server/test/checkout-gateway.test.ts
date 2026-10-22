import { describe, expect, it } from "vitest";
import type { ShopMcp } from "../src/infrastructure/shop/client.js";
import { ShopAccountGateway, ShopCheckoutGateway } from "../src/infrastructure/shop/gateways.js";

const address = { id: "addr1", street: "1-1 Chome" };

function fakeMcp(responses: Record<string, unknown>[]) {
  const calls: { name: string; args: any }[] = [];
  const mcp: ShopMcp = {
    async callTool(name, args) {
      calls.push({ name, args: structuredClone(args) });
      return { isError: false, data: responses.shift() };
    },
  };
  return { mcp, calls };
}

const base = { id: "co1", status: "incomplete", line_items: [], totals: [], messages: [] };

describe("ShopCheckoutGateway.useAccountAddress", () => {
  it("copies the saved address into the delivery method and selects it", async () => {
    const withMethod = { ...base, fulfillment: { methods: [{ type: "shipping", destinations: [] }] } };
    const { mcp, calls } = fakeMcp([withMethod, { ...withMethod }]);
    await new ShopCheckoutGateway(mcp).useAccountAddress("s.myshopify.com", "co1", {
      addresses: [
        { id: "other", raw: { id: "other" } },
        { id: "addr1", raw: address },
      ],
      preferredAddressId: "addr1",
    });
    const update = calls.find((c) => c.name === "update_checkout")!;
    const method = update.args.checkout.fulfillment.methods[0];
    expect(method.destinations).toEqual([address]);
    expect(method.selected_destination_id).toBe("addr1");
  });

  it("selects the first delivery option of a group that has none selected", async () => {
    const withMethod = { ...base, fulfillment: { methods: [{ type: "shipping", destinations: [] }] } };
    const afterAddress = {
      ...base,
      fulfillment: {
        methods: [
          {
            type: "shipping",
            selected_destination_id: "addr1",
            destinations: [address],
            groups: [{ id: "g1", options: [{ id: "opt1" }, { id: "opt2" }] }],
          },
        ],
      },
    };
    const { mcp, calls } = fakeMcp([withMethod, afterAddress, { ...afterAddress, status: "ready_for_complete" }]);
    const checkout = await new ShopCheckoutGateway(mcp).useAccountAddress("s.myshopify.com", "co1", {
      addresses: [{ id: "addr1", raw: address }],
    });
    const updates = calls.filter((c) => c.name === "update_checkout");
    expect(updates).toHaveLength(2);
    expect(updates[1]!.args.checkout.fulfillment.methods[0].groups[0].selected_option_id).toBe("opt1");
    expect(checkout.status).toBe("ready_for_complete");
  });

  it("leaves a group alone when an option is already selected", async () => {
    const withMethod = { ...base, fulfillment: { methods: [{ type: "shipping", destinations: [] }] } };
    const chosen = {
      ...base,
      fulfillment: { methods: [{ groups: [{ id: "g1", selected_option_id: "opt2", options: [{ id: "opt1" }, { id: "opt2" }] }] }] },
    };
    const { mcp, calls } = fakeMcp([withMethod, chosen]);
    await new ShopCheckoutGateway(mcp).useAccountAddress("s.myshopify.com", "co1", { addresses: [{ id: "addr1", raw: address }] });
    expect(calls.filter((c) => c.name === "update_checkout")).toHaveLength(1);
  });
});

describe("ShopAccountGateway", () => {
  it("keeps the Shop Pay budget, links and messages but not the saved addresses or email", async () => {
    const { mcp } = fakeMcp([
      {
        buyer: { email: "a@example.com" },
        addresses: [{ id: "addr1", street_address: "1-1" }],
        preferred_address_id: "addr1",
        payment: { instruments: [{ limit: 500000, remaining_amount: 0 }] },
        links: [{ type: "manage_connection", url: "https://shop.app/manage" }],
        messages: [{ code: "x" }],
      },
    ]);
    const account = await new ShopAccountGateway(mcp).get();
    expect(account.connection).toEqual({
      payment: { instruments: [{ limit: 500000, remaining_amount: 0 }] },
      links: [{ type: "manage_connection", url: "https://shop.app/manage" }],
      messages: [{ code: "x" }],
    });
    expect(JSON.stringify(account.connection)).not.toContain("example.com");
  });
});
