import { describe, expect, it } from "vitest";
import { redact } from "../src/infrastructure/shop/redact.js";

describe("redact", () => {
  it("hides payment credentials and tokens at any depth", () => {
    const out = redact({
      payment: { instruments: [{ id: "i1", credential: { type: "shop_token", token: "secret" } }] },
      access_token: "a",
      device_code: "d",
      keep: "visible",
    }) as any;
    expect(out.payment.instruments[0].credential).toBe("[redacted]");
    expect(out.payment.instruments[0].id).toBe("i1");
    expect(out.access_token).toBe("[redacted]");
    expect(out.device_code).toBe("[redacted]");
    expect(out.keep).toBe("visible");
  });

  it("opens JSON that is embedded in a string, as MCP tool results are", () => {
    const text = JSON.stringify({
      result: { content: [{ type: "text", text: JSON.stringify({ id: "co1", credential: { token: "x" } }) }] },
    });
    const out = redact(JSON.parse(text)) as any;
    expect(out.result.content[0].text).toEqual({ id: "co1", credential: "[redacted]" });
  });

  it("leaves plain strings and numbers alone and does not mutate its input", () => {
    const input = { n: 1, s: "hello {not json", credential: "c" };
    expect(redact(input)).toEqual({ n: 1, s: "hello {not json", credential: "[redacted]" });
    expect(input.credential).toBe("c");
  });
});
