import type { ApprovalDto } from "@shop-agent/contract";
import { LineItems } from "./LineItems";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

/** What the shopper reads after the decision. Pending approvals show buttons instead. */
function outcome(approval: ApprovalDto): string | undefined {
  switch (approval.state) {
    case "completed":
      return `購入が完了しました${approval.orderId ? `（注文 ${approval.orderId}）` : ""}`;
    case "rejected":
      return "キャンセルしました。請求はありません。";
    case "failed":
      return `支払いできませんでした。${approval.note ?? ""}`;
    case "unknown":
      return `支払いの結果を確認できませんでした。再試行せず、メールかShopの注文履歴で確認してください。${approval.note ?? ""}`;
    default:
      return undefined;
  }
}

export function ApprovalCard({
  approval,
  busy,
  onApprove,
  onReject,
}: {
  approval: ApprovalDto;
  busy: boolean;
  onApprove: (instrumentId: string) => void;
  onReject: () => void;
}) {
  return (
    <Card kind="approval" title={`購入の確認: ${approval.shop}`}>
      <LineItems items={approval.items} />
      <div className="total">支払い合計 {approval.total}</div>
      {approval.state === "pending" ? (
        <div className="actions">
          {approval.instruments.map((i) => (
            <Button key={i.id} variant="primary" disabled={busy} onClick={() => onApprove(i.id)}>
              {i.label} で支払う
            </Button>
          ))}
          <Button disabled={busy} onClick={onReject}>
            やめる
          </Button>
        </div>
      ) : (
        <div className={`state ${approval.state}`}>{outcome(approval)}</div>
      )}
    </Card>
  );
}
