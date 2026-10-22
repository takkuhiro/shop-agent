import type { TranscriptEntry } from "@shop-agent/contract";

/** What the screen has shown so far, in order. Streamed text is stored as one entry per message, not per chunk. */
export class Transcript {
  private readonly items: TranscriptEntry[] = [];

  add(entry: TranscriptEntry): void {
    // Cart snapshots only feed the cart panel, which the session redraws from its own state.
    if (entry.type === "carts" || entry.type === "done") return;
    const last = this.items.at(-1);
    if (entry.type === "text" && last?.type === "text") {
      this.items[this.items.length - 1] = { type: "text", delta: last.delta + entry.delta };
      return;
    }
    this.items.push(entry);
  }

  entries(): TranscriptEntry[] {
    return [...this.items];
  }
}
