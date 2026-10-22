import { useEffect, useRef, useState } from "react";
import { CartView } from "./components/CartView";
import { ChatEntryView } from "./components/ChatEntryView";
import { Header } from "./components/Header";
import { Button } from "./components/ui/Button";
import { Muted } from "./components/ui/Muted";
import { useShopChat } from "./hooks/use-shop-chat";

export function App() {
  const { session, entries, carts, busy, send, addToCart, decide, showLogin, signOut, afterSignIn } = useShopChat();
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the chat changes
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className="layout">
      <Header session={session} onSignIn={showLogin} onSignOut={signOut} />

      <main>
        <section className="chat">
          {entries.length === 0 && <Muted>探したいものを話しかけてください。例: 「5000円以内で、評価の高いコーヒーマグを探して」</Muted>}
          {entries.map((entry, i) => (
            <ChatEntryView
              // biome-ignore lint/suspicious/noArrayIndexKey: entries are only appended or updated in place, never reordered
              key={i}
              entry={entry}
              session={session}
              busy={busy}
              onAddToCart={addToCart}
              onDecide={decide}
              onSignedIn={afterSignIn}
            />
          ))}
          <div ref={bottom} />
        </section>

        <aside>
          <h2>カート</h2>
          {carts.length === 0 ? <Muted>カートは空です。</Muted> : carts.map((c) => <CartView key={c.shop} cart={c} />)}
        </aside>
      </main>

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          const text = input;
          setInput("");
          void send(text);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="メッセージを入力"
          disabled={!session || busy}
          // biome-ignore lint/a11y/noAutofocus: the chat input is the only thing to do on this screen
          autoFocus
        />
        <Button type="submit" variant="primary" disabled={!session || busy || !input.trim()}>
          送信
        </Button>
      </form>
    </div>
  );
}
