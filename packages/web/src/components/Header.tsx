import type { SessionDto } from "@shop-agent/contract";
import { ConnectionInfo } from "./ConnectionInfo";
import { Button } from "./ui/Button";

export function Header({ session, onSignIn, onSignOut }: { session?: SessionDto; onSignIn: () => void; onSignOut: () => void }) {
  return (
    <header>
      <strong>Shop Agent</strong>
      {session && (
        <>
          <span className="muted">
            配送先 {session.market.country} / {session.market.currency}
          </span>
          <span className="spacer" />
          <SignInControls session={session} onSignIn={onSignIn} onSignOut={onSignOut} />
        </>
      )}
    </header>
  );
}

function SignInControls({ session, onSignIn, onSignOut }: { session: SessionDto; onSignIn: () => void; onSignOut: () => void }) {
  if (session.auth.signedIn) {
    return (
      <>
        <Button onClick={onSignOut}>サインアウト</Button>
        <ConnectionInfo key={session.sessionId} sessionId={session.sessionId} />
        <span className="badge">サインイン済み</span>
      </>
    );
  }
  return session.auth.loginAvailable ? (
    <Button onClick={onSignIn}>Shopにサインイン</Button>
  ) : (
    <span className="muted">サインイン未設定</span>
  );
}
