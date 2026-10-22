import type { CheckoutDto } from "@shop-agent/contract";
import { CartView } from "./CartView";
import { Card } from "./ui/Card";
import { ExternalLink } from "./ui/ExternalLink";
import { Muted } from "./ui/Muted";

export function CheckoutCard({ checkout }: { checkout: CheckoutDto }) {
  return (
    <Card kind="checkout" title={`チェックアウト: ${checkout.shop}`}>
      <CartView cart={checkout} />
      {checkout.messages.map((m) => (
        <Muted key={`${m.code}:${m.content}`}>{m.content}</Muted>
      ))}
      <Muted>状態: {checkout.status}</Muted>
      {checkout.continueUrl && !checkout.payableInApp && (
        <ExternalLink asButton href={checkout.continueUrl}>
          店舗のページで支払う
        </ExternalLink>
      )}
    </Card>
  );
}
