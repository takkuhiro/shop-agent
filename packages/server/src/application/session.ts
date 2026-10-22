import type { AccountConnectionDto, ApprovalDto, ChatEvent, SessionDto, TranscriptEntry } from "@shop-agent/contract";
import { AuthRequiredError } from "../domain/errors.js";
import type { Market } from "../domain/market.js";
import type { AccountGateway, Authenticator } from "../domain/ports.js";
import type { ConversationAgent } from "./agent/conversation-agent.js";
import type { SessionState } from "./session-state.js";
import { Transcript } from "./transcript.js";
import type { ApprovePurchase } from "./usecases/checkout.js";
import { toApprovalDto, toCartDto } from "./views/ui-view.js";

/** One shopper's session: their conversation, their carts and their Shop sign-in. */
export class Session {
  private readonly log = new Transcript();

  constructor(
    readonly id: string,
    readonly market: Market,
    readonly agent: ConversationAgent,
    readonly auth: Authenticator,
    readonly state: SessionState,
    private readonly approvePurchase: ApprovePurchase,
    private readonly account: AccountGateway,
  ) {}

  /** The Shop Pay budget and management links of this sign-in, for the developer to read. Never the address or email. */
  async connection(): Promise<AccountConnectionDto> {
    if (!this.auth.signedIn) throw new AuthRequiredError();
    return (await this.account.get()).connection ?? {};
  }

  snapshot(): SessionDto {
    return {
      sessionId: this.id,
      market: this.market,
      auth: { signedIn: this.auth.signedIn, loginAvailable: this.auth.available },
      carts: this.state.cartSnapshots().map(toCartDto),
    };
  }

  /** Handles one message from the shopper. Every event is passed on and also kept for the transcript. */
  async chat(text: string, hint: string | undefined, emit: (event: ChatEvent) => void): Promise<void> {
    if (this.agent.isBusy) throw new Error("the agent is still answering the previous message");
    this.log.add({ type: "user", text });
    const record = (event: ChatEvent) => {
      this.log.add(event);
      emit(event);
    };
    try {
      await this.agent.handle(text, hint, record);
    } catch (error) {
      record({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Everything the screen showed, so a reloaded page can draw it again. Approval cards show their current state. */
  transcript(): TranscriptEntry[] {
    return this.log.entries().map((entry) => {
      if (entry.type !== "approval") return entry;
      try {
        return { type: "approval", approval: toApprovalDto(this.state.approval(entry.approval.id)) };
      } catch {
        return entry;
      }
    });
  }

  /** The shopper pressed the pay button. The agent is told the outcome on its next turn. */
  async approve(approvalId: string, instrumentId: string): Promise<ApprovalDto> {
    const approval = await this.approvePurchase.execute(approvalId, instrumentId);
    this.agent.addNotice(this.outcomeNotice(approval.state, approval.shop, approval.orderId));
    const dto = toApprovalDto(approval);
    if (approval.state === "completed") {
      this.state.forgetShop(approval.shop);
      this.log.add({ type: "text", delta: this.completionMessage(dto) });
    }
    return dto;
  }

  /** Said by the app, not the model: an order is a fact the screen must state exactly. */
  private completionMessage(approval: ApprovalDto): string {
    const items = approval.items.map((i) => `${i.title} × ${i.quantity}`).join("、");
    return `注文が完了しました。${approval.shop} で ${items} を購入しました（支払い合計 ${approval.total}）。確認メールか Shop の注文履歴でも確認できます。`;
  }

  reject(approvalId: string): ApprovalDto {
    const approval = this.approvePurchase.reject(approvalId);
    this.agent.addNotice(`The shopper cancelled the purchase for ${approval.shop}. Nothing was charged.`);
    return toApprovalDto(approval);
  }

  signedIn(): void {
    this.agent.addNotice("The shopper has signed in to Shop.");
  }

  private outcomeNotice(state: string, shop: string, orderId?: string): string {
    if (state === "completed") return `The shopper paid for ${shop}. The order is confirmed${orderId ? ` (order ${orderId})` : ""}.`;
    if (state === "unknown")
      return `The payment for ${shop} could not be confirmed. Do not retry; tell the shopper to check their email or Shop orders.`;
    return `The payment for ${shop} did not go through (${state}). Do not retry it yourself.`;
  }
}
