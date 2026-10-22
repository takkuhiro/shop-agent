import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { SessionRegistry } from "./application/session-registry.js";
import { configFromEnv, SessionFactory } from "./composition.js";
import { createApp } from "./presentation/app.js";

const config = configFromEnv(process.env);
config.tokenFile ??= resolve(fileURLToPath(import.meta.url), "../../../../.data/shop-token.json");
if (!config.anthropicApiKey) {
  console.error("ANTHROPIC_API_KEY is not set. Put it in .env (see .env.example).");
  process.exit(1);
}

const factory = new SessionFactory(config);
const webDist = resolve(fileURLToPath(import.meta.url), "../../../web/dist");
const sessions = new SessionRegistry();
setInterval(() => sessions.sweep(), 60_000).unref();
const app = createApp({
  sessions,
  createSession: () => factory.create(),
  staticDir: process.env.SERVE_WEB === "1" ? relative(process.cwd(), webDist) : undefined,
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`shop-agent API on http://127.0.0.1:${port}  (${config.market.country}/${config.market.currency}, ${config.model})`);
  if (!config.shopClientId) console.log("SHOP_AUTH_CLIENT_ID is not set: Shop sign-in is off, checkout goes through the merchant's page.");
});
