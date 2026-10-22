import type { ApprovalDto, ProductDto, SessionDto } from "@shop-agent/contract";
import type { Entry } from "../entries";
import { ApprovalCard } from "./ApprovalCard";
import { CheckoutCard } from "./CheckoutCard";
import { LoginCard } from "./LoginCard";
import { Markdown } from "./Markdown";
import { ProductCards } from "./ProductCards";
import { ToolCallCard } from "./ToolCallCard";

interface Props {
  entry: Entry;
  session?: SessionDto;
  busy: boolean;
  onAddToCart: (product: ProductDto, variantIndex: number) => void;
  onDecide: (approval: ApprovalDto, instrumentId?: string) => void;
  onSignedIn: () => void;
}

/** One line of the chat: the bubble or card that an entry is drawn as. */
export function ChatEntryView({ entry, session, busy, onAddToCart, onDecide, onSignedIn }: Props) {
  switch (entry.kind) {
    case "user":
      return <div className="bubble user">{entry.text}</div>;
    case "assistant":
      return (
        <div className="bubble assistant">
          <Markdown text={entry.text} />
        </div>
      );
    case "tool":
      return <ToolCallCard call={entry} />;
    case "products":
      return <ProductCards products={entry.products} onAdd={onAddToCart} />;
    case "checkout":
      return <CheckoutCard checkout={entry.checkout} />;
    case "approval":
      return (
        <ApprovalCard
          approval={entry.approval}
          busy={busy}
          onApprove={(instrumentId) => onDecide(entry.approval, instrumentId)}
          onReject={() => onDecide(entry.approval)}
        />
      );
    case "login":
      // Once signed in, the card has done its job.
      return !session || session.auth.signedIn ? null : (
        <LoginCard sessionId={session.sessionId} reason={entry.reason} available={session.auth.loginAvailable} onSignedIn={onSignedIn} />
      );
    case "error":
      return <div className="bubble error">{entry.message}</div>;
  }
}
