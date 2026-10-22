import { useState } from "react";
import { api } from "../api";
import { errorMessage } from "../error-message";

/** The Shop Pay budget and manage links of this sign-in, read from Shop's get_account when opened. */
export function ConnectionInfo({ sessionId }: { sessionId: string }) {
  const [text, setText] = useState<string>();

  async function load(open: boolean) {
    if (!open) return;
    setText("読み込み中…");
    try {
      setText(JSON.stringify(await api.getAccount(sessionId), null, 2));
    } catch (e) {
      setText(errorMessage(e));
    }
  }

  return (
    <details className="connection" onToggle={(e) => void load(e.currentTarget.open)}>
      <summary>接続の予算</summary>
      <pre>{text}</pre>
    </details>
  );
}
