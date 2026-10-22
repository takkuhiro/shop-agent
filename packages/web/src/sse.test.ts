import { describe, expect, it } from "vitest";
import { takeFrames } from "./sse";

describe("takeFrames", () => {
  it("returns the data of each complete frame", () => {
    expect(takeFrames('data: {"a":1}\n\ndata: {"b":2}\n\n')).toEqual({ frames: ['{"a":1}', '{"b":2}'], rest: "" });
  });

  it("keeps an unfinished frame for the next chunk", () => {
    expect(takeFrames('data: {"a":1}\n\ndata: {"b"')).toEqual({ frames: ['{"a":1}'], rest: 'data: {"b"' });
  });

  it("joins the data lines of one frame and skips frames without data", () => {
    expect(takeFrames('data: {"a":\ndata: 1}\n\n: keep-alive\n\n')).toEqual({ frames: ['{"a":1}'], rest: "" });
  });
});
