// Kudos Bot — OPTIONAL self-hosted endpoint (zero dependencies, Node 18+).
// Use this instead of Pipedream if you want to host on Render / Railway / Fly / a VPS.
// It reuses the exact same logic as pipedream-step.mjs and ADDS full Slack
// request-signature verification (HMAC-SHA256 with your Signing Secret).
//
//   SLACK_SIGNING_SECRET=xxxx PORT=3000 node kudos-bot/server.mjs
//   Request URL in Slack:  https://your-host/slack/commands
//
// Signing Secret: api.slack.com/apps → your app → Basic Information → App Credentials.

import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

globalThis.defineComponent ??= (c) => c;
const src = await readFile(new URL("./pipedream-step.mjs", import.meta.url), "utf8");
const step = (await import("data:text/javascript," + encodeURIComponent(src))).default;

export function verifySlackSignature(secret, headers, rawBody, nowSec = Math.floor(Date.now() / 1000)) {
  const ts = headers["x-slack-request-timestamp"];
  const sig = headers["x-slack-signature"];
  if (!secret || !ts || !sig) return false;
  if (Math.abs(nowSec - Number(ts)) > 60 * 5) return false; // replay protection
  const expected = "v0=" + crypto.createHmac("sha256", secret).update(`v0:${ts}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Pure request handler (no sockets) → easy to unit-test and to reuse in serverless hosts.
// headers must have lower-case keys (Node's req.headers already does).
export async function handleRequest({ method, url, headers, raw }, signingSecret) {
  const text = (status, body) => ({ status, type: "text/plain", body });
  if (method === "GET" && url === "/") return text(200, "Kudos Bot is running 💐");
  if (method !== "POST" || url !== "/slack/commands") return text(404, "");
  if (!verifySlackSignature(signingSecret, headers, raw)) return text(401, "invalid signature");

  const body = Object.fromEntries(new URLSearchParams(raw));
  let out = { status: 200, body: "" };
  const $ = { respond: async (r) => { out = r; } };
  try {
    await step.run({ steps: { trigger: { event: { body, headers } } }, $ });
  } catch (err) {
    console.error(err);
    out = { status: 200, body: { response_type: "ephemeral", text: "Kudos Bot hit a snag — please try again." } };
  }
  const isJson = typeof out.body === "object";
  return {
    status: out.status || 200,
    type: isJson ? "application/json" : "text/plain",
    body: isJson ? JSON.stringify(out.body) : String(out.body ?? ""),
  };
}

export function createApp({ signingSecret = process.env.SLACK_SIGNING_SECRET } = {}) {
  return http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 64 * 1024) return void res.writeHead(413).end();
    }
    const out = await handleRequest({ method: req.method, url: req.url, headers: req.headers, raw }, signingSecret);
    res.writeHead(out.status, { "Content-Type": out.type }).end(out.body);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (!process.env.SLACK_SIGNING_SECRET) {
    console.error("Set SLACK_SIGNING_SECRET first.");
    process.exit(1);
  }
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`Kudos Bot listening on :${port}/slack/commands`));
}
