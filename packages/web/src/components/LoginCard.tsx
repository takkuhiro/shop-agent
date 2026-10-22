import type { LoginChallengeDto } from "@shop-agent/contract";
import { useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage } from "../error-message";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { ExternalLink } from "./ui/ExternalLink";
import { Muted } from "./ui/Muted";

/** Shop sign-in with a device code: the shopper approves the code on Shop's own page. */
export function LoginCard({
  sessionId,
  reason,
  available,
  onSignedIn,
}: {
  sessionId: string;
  reason: string;
  available: boolean;
  onSignedIn: () => void;
}) {
  const [challenge, setChallenge] = useState<LoginChallengeDto>();
  const [status, setStatus] = useState<"idle" | "waiting" | "expired" | "denied">("idle");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (status !== "waiting" || !challenge) return;
    const timer = setInterval(async () => {
      try {
        const poll = await api.pollLogin(sessionId);
        if (poll.status === "signed_in") onSignedIn();
        else if (poll.status !== "pending") setStatus(poll.status);
      } catch (e) {
        setError(errorMessage(e));
      }
    }, Math.max(challenge.interval, 2) * 1000);
    return () => clearInterval(timer);
  }, [status, challenge, sessionId, onSignedIn]);

  async function start() {
    setError(undefined);
    try {
      setChallenge(await api.startLogin(sessionId));
      setStatus("waiting");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card kind="login" title="Shopにサインイン">
      <Muted>{reason}</Muted>
      {!available ? (
        <Muted>このアプリにはShopのサインイン設定（SHOP_AUTH_CLIENT_ID）がないため、店舗のページで支払ってください。</Muted>
      ) : status === "waiting" && challenge ? (
        <>
          <p>
            次のコードを Shop の画面で入力してください: <code className="code">{challenge.userCode}</code>
          </p>
          <ExternalLink asButton href={challenge.verificationUriComplete ?? challenge.verificationUri}>
            Shopを開く
          </ExternalLink>
          <Muted>承認を待っています…</Muted>
        </>
      ) : (
        <Button variant="primary" onClick={start}>
          {status === "idle" ? "サインインする" : "もう一度サインインする"}
        </Button>
      )}
      {status === "expired" && <div className="state failed">コードの期限が切れました。</div>}
      {status === "denied" && <div className="state failed">サインインが拒否されました。</div>}
      {error && <div className="state failed">{error}</div>}
    </Card>
  );
}
