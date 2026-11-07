// Real end-to-end HTTP test: starts server.mjs on a local port, sends signed
// Slack-style requests over the network stack, checks the replies, then stops.
// Run: node kudos-bot/test/e2e.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { createApp } = await import("../server.mjs");
const secret = "e2e_secret";
const server = createApp({ signingSecret: secret }).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const sign = (ts, b) => "v0=" + crypto.createHmac("sha256", secret).update(`v0:${ts}:${b}`).digest("hex");
async function slash(text) {
  const form = new URLSearchParams({ command: "/compliment", text, channel_id: "C1", user_id: "U0ME", team_id: "T1" }).toString();
  const ts = String(Math.floor(Date.now() / 1000));
  return fetch(`${baseUrl}/slack/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Slack-Request-Timestamp": ts, "X-Slack-Signature": sign(ts, form) },
    body: form,
  });
}

try {
  let r = await fetch(baseUrl + "/");
  assert.equal(r.status, 200);
  console.log("✔ GET / health →", await r.text());

  r = await slash("<@U0SAM|sam> teamwork");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /application\/json/);
  const j = await r.json();
  assert.equal(j.response_type, "in_channel");
  console.log("✔ POST /slack/commands (signed) →", j.text);

  r = await slash("<@U0SAM|sam> for launching the product");
  assert.equal(r.status, 200);
  const jCustom = await r.json();
  assert.equal(jCustom.response_type, "in_channel");
  assert.match(jCustom.text, /> _"launching the product"_/);
  console.log("✔ POST /slack/commands with custom note →", jCustom.text.split("\n")[1]);

  r = await slash("themes");
  assert.equal((await r.json()).response_type, "ephemeral");
  console.log("✔ themes → ephemeral");

  r = await slash("stats");
  assert.equal((await r.json()).response_type, "ephemeral");
  console.log("✔ stats → ephemeral");

  r = await slash("help");
  assert.equal((await r.json()).response_type, "ephemeral");
  console.log("✔ help → ephemeral");

  r = await fetch(`${baseUrl}/slack/commands`, { method: "POST", body: "text=hi" });
  assert.equal(r.status, 401);
  console.log("✔ unsigned request → 401");

  console.log("\nE2E HTTP test passed.");
} finally {
  server.close();
}

