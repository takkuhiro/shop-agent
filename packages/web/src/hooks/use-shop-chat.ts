import type { ApprovalDto, CartDto, ChatEvent, ProductDto, SessionDto } from "@shop-agent/contract";
import { useCallback, useEffect, useState } from "react";
import { addToCartMessage } from "../add-to-cart";
import { api, sendMessage } from "../api";
import { applyEvent, type Entry, replay } from "../entries";
import { errorMessage } from "../error-message";
import { openSession } from "../open-session";

/** Per-tab storage. Reading it may throw (private windows, blocked storage); the app then starts a fresh session. */
function tabStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** The state of one chat screen and everything the shopper can do on it. */
export function useShopChat() {
  const [session, setSession] = useState<SessionDto>();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [carts, setCarts] = useState<CartDto[]>([]);
  const [busy, setBusy] = useState(false);

  const showError = useCallback((e: unknown) => setEntries((p) => [...p, { kind: "error", message: errorMessage(e) }]), []);

  useEffect(() => {
    openSession({ storage: tabStorage(), get: api.getSession, create: api.createSession })
      .then(({ session: s, resumed }) => {
        setSession(s);
        setCarts(s.carts);
        if (!resumed) return;
        return api.getTranscript(s.sessionId).then((events) => setEntries(replay(events)));
      })
      .catch(showError);
  }, [showError]);

  const refreshSession = useCallback(async () => {
    if (session) setSession(await api.getSession(session.sessionId));
  }, [session]);

  const onEvent = useCallback((e: ChatEvent) => {
    if (e.type === "carts") setCarts(e.carts);
    else setEntries((prev) => applyEvent(prev, e));
  }, []);

  const send = useCallback(
    async (text: string, hint?: string) => {
      if (!session || busy || !text.trim()) return;
      setBusy(true);
      setEntries((p) => applyEvent(p, { type: "user", text }));
      try {
        await sendMessage(session.sessionId, { text, hint }, onEvent);
      } catch (e) {
        showError(e);
      } finally {
        setBusy(false);
      }
    },
    [session, busy, onEvent, showError],
  );

  const addToCart = (product: ProductDto, variantIndex: number) => {
    const message = addToCartMessage(product, variantIndex);
    if (message) void send(message.text, message.hint);
  };

  /** Approves with the chosen payment instrument, or rejects when none is given. */
  const decide = async (approval: ApprovalDto, instrumentId?: string) => {
    if (!session) return;
    setBusy(true);
    try {
      const next = instrumentId
        ? await api.approve(session.sessionId, approval.id, instrumentId)
        : await api.reject(session.sessionId, approval.id);
      setEntries((p) => p.map((x) => (x.kind === "approval" && x.approval.id === next.id ? { kind: "approval", approval: next } : x)));
      if (next.state === "completed") {
        // The server cleared the paid cart and added the confirmation to the chat; show both.
        const [fresh, events] = await Promise.all([api.getSession(session.sessionId), api.getTranscript(session.sessionId)]);
        setSession(fresh);
        setCarts(fresh.carts);
        setEntries(replay(events));
      }
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const showLogin = () =>
    setEntries((p) =>
      p.some((x) => x.kind === "login") ? p : [...p, { kind: "login", reason: "Shopでの支払いにはサインインが必要です。" }],
    );

  const signOut = async () => {
    if (session) setSession(await api.logout(session.sessionId));
  };

  const afterSignIn = () => void refreshSession().then(() => send("サインインしました"));

  return { session, entries, carts, busy, send, addToCart, decide, showLogin, signOut, afterSignIn };
}
