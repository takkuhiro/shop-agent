import { serveStatic } from "@hono/node-server/serve-static";
import { ApproveRequest, SendMessageRequest } from "@shop-agent/contract";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Session } from "../application/session.js";
import { SessionRegistry } from "../application/session-registry.js";
import { AuthRequiredError, DomainError } from "../domain/errors.js";

interface Options {
  createSession: () => Session;
  sessions?: SessionRegistry;
  /** Directory with the built web app. Omit in development, where Vite serves it. */
  staticDir?: string;
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function createApp({ createSession, sessions = new SessionRegistry(), staticDir }: Options): Hono {
  const app = new Hono();

  // The API holds the shopper's carts and Shop sign-in, so only pages served from this machine may call it.
  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("origin");
    if (c.req.method !== "GET" && origin && !LOCAL_ORIGIN.test(origin)) return c.json({ error: "forbidden origin" }, 403);
    await next();
  });

  const find = (id: string) => sessions.find(id);

  app.post("/api/sessions", (c) => {
    const session = createSession();
    sessions.add(session);
    return c.json(session.snapshot());
  });

  app.get("/api/sessions/:id", (c) => {
    const session = find(c.req.param("id"));
    return session ? c.json(session.snapshot()) : c.json({ error: "session not found" }, 404);
  });

  app.post("/api/sessions/:id/messages", async (c) => {
    const session = find(c.req.param("id"));
    if (!session) return c.json({ error: "session not found" }, 404);
    const body = SendMessageRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: "invalid message" }, 400);
    if (session.agent.isBusy) return c.json({ error: "the agent is still answering" }, 409);

    return streamSSE(c, async (stream) => {
      const send = (event: object) => stream.writeSSE({ data: JSON.stringify(event) });
      await session.chat(body.data.text, body.data.hint, (event) => void send(event));
      await send({ type: "done" });
    });
  });

  app.get("/api/sessions/:id/transcript", (c) => {
    const session = find(c.req.param("id"));
    return session ? c.json(session.transcript()) : c.json({ error: "session not found" }, 404);
  });

  app.post("/api/sessions/:id/login", async (c) => {
    const session = find(c.req.param("id"));
    if (!session) return c.json({ error: "session not found" }, 404);
    try {
      return c.json(await session.auth.start());
    } catch (error) {
      return c.json({ error: message(error) }, error instanceof DomainError ? 400 : 502);
    }
  });

  app.get("/api/sessions/:id/login", async (c) => {
    const session = find(c.req.param("id"));
    if (!session) return c.json({ error: "session not found" }, 404);
    const status = await session.auth.poll();
    if (status === "signed_in") session.signedIn();
    return c.json({ status });
  });

  app.get("/api/sessions/:id/account", async (c) => {
    const session = find(c.req.param("id"));
    if (!session) return c.json({ error: "session not found" }, 404);
    try {
      return c.json(await session.connection());
    } catch (error) {
      if (error instanceof AuthRequiredError) return c.json({ error: "sign-in required" }, 401);
      return c.json({ error: message(error) }, 502);
    }
  });

  app.post("/api/sessions/:id/logout", (c) => {
    const session = find(c.req.param("id"));
    if (!session) return c.json({ error: "session not found" }, 404);
    session.auth.signOut();
    return c.json(session.snapshot());
  });

  app.post("/api/sessions/:id/purchases/:approvalId/approve", async (c) => {
    const session = find(c.req.param("id"));
    if (!session) return c.json({ error: "session not found" }, 404);
    const body = ApproveRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: "invalid request" }, 400);
    try {
      return c.json(await session.approve(c.req.param("approvalId"), body.data.instrumentId));
    } catch (error) {
      return c.json({ error: message(error) }, error instanceof DomainError ? 409 : 502);
    }
  });

  app.post("/api/sessions/:id/purchases/:approvalId/reject", (c) => {
    const session = find(c.req.param("id"));
    if (!session) return c.json({ error: "session not found" }, 404);
    try {
      return c.json(session.reject(c.req.param("approvalId")));
    } catch (error) {
      return c.json({ error: message(error) }, 409);
    }
  });

  if (staticDir) {
    app.use("/*", serveStatic({ root: staticDir }));
    app.get("*", serveStatic({ root: staticDir, path: "index.html" }));
  }
  return app;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
