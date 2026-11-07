// Local checks for Kudos Bot. Run: node kudos-bot/test/harness.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

globalThis.defineComponent = (c) => c;
const src = await readFile(new URL("../pipedream-step.mjs", import.meta.url), "utf8");
const step = (await import("../pipedream-step.mjs")).default;

let passed = 0;
const ok = (msg) => { passed++; console.log("✔ " + msg); };

async function call(body) {
  let responded;
  const $ = { respond: async (r) => { responded = r; } };
  await step.run({ steps: { trigger: { event: { body } } }, $ });
  return responded;
}
const base = { command: "/compliment", channel_id: "C1", user_id: "U0ME", team_id: "T1" };

// 1. Plain
let r = await call({ ...base, text: "" });
assert.equal(r.status, 200);
assert.equal(r.immediate, true);
assert.equal(r.body.response_type, "in_channel");
assert.equal(r.body.blocks[0].type, "section");
assert.match(r.body.blocks[1].elements[0].text, /Sent by <@U0ME>/);
ok("plain → in_channel Block Kit with credit: " + r.body.text);

// 2. Single mention
r = await call({ ...base, text: "<@U0SAM123|sam>" });
assert.match(r.body.text, /^<@U0SAM123> /);
ok("single mention: " + r.body.text);

// 3. Multi mention + theme, distinct compliments, dedupe
r = await call({ ...base, text: "<@U0A|a> <@U0B|b> <@U0A|a> code" });
const lines = r.body.text.split("\n");
assert.equal(lines.length, 2);
assert.notEqual(lines[0].split(" — ")[1], lines[1].split(" — ")[1]);
assert.match(r.body.blocks[1].elements[0].text, /theme: code/);
ok("multi mention, deduped, unique compliments, theme");

// 4. Theme pool respected
const codeSet = src.match(/code: \[([\s\S]*?)\]/)[1];
for (let i = 0; i < 20; i++) {
  r = await call({ ...base, text: "code" });
  assert.ok(codeSet.includes(r.body.text.replace(" 💐", "").replace(/'/g, "'")));
}
ok("theme 'code' only uses code compliments");

// 5. Help is private
r = await call({ ...base, text: "help" });
assert.equal(r.body.response_type, "ephemeral");
assert.match(r.body.text, /Themes:/);
ok("help → ephemeral");

// 6. Too many mentions
const many = Array.from({ length: 11 }, (_, i) => `<@U0X${i}|x>`).join(" ");
r = await call({ ...base, text: many });
assert.equal(r.body.response_type, "ephemeral");
ok("more than 10 mentions → polite ephemeral");

// 7. Allow-list
process.env.ALLOWED_TEAM_ID = "T1";
r = await call({ ...base });
assert.equal(r.body.response_type, "in_channel");
r = await call({ ...base, team_id: "T_OTHER" });
assert.equal(r.body.response_type, "ephemeral");
delete process.env.ALLOWED_TEAM_ID;
ok("ALLOWED_TEAM_ID blocks other workspaces");

// 8. SSL check
r = await call({ ssl_check: "1" });
assert.equal(r.status, 200);
assert.equal(r.body, "");
ok("ssl_check acked");

// 9. Manifest least privilege
const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
assert.deepEqual(manifest.oauth_config.scopes.bot, ["commands"]);
assert.equal(manifest.features.slash_commands[0].command, "/compliment");
assert.equal(manifest.features.slash_commands[0].should_escape, true);
assert.ok(manifest.display_information.description.length <= 140);
const ld = manifest.display_information.long_description.length;
assert.ok(ld >= 175 && ld <= 4000);
ok("manifest: single scope `commands`, identity fields valid");

// 10. Self-hosted server with Slack signature verification (end-to-end over HTTP)
const { handleRequest, verifySlackSignature } = await import("../server.mjs");
const secret = "test_secret";
const form = new URLSearchParams({ ...base, text: "<@U0SAM|sam> teamwork" }).toString();
const sign = (ts, b, s = secret) => "v0=" + crypto.createHmac("sha256", s).update(`v0:${ts}:${b}`).digest("hex");
const now = Math.floor(Date.now() / 1000);
const post = (ts, sig) => handleRequest({
  method: "POST", url: "/slack/commands", raw: form,
  headers: { "x-slack-request-timestamp": String(ts), "x-slack-signature": sig },
}, secret);

let res = await post(now, sign(now, form));
assert.equal(res.status, 200);
assert.equal(res.type, "application/json");
const json = JSON.parse(res.body);
assert.equal(json.response_type, "in_channel");
assert.match(json.text, /^<@U0SAM> /);
assert.equal((await post(now, sign(now, form, "wrong"))).status, 401);            // forged
assert.equal((await post(now - 600, sign(now - 600, form))).status, 401);         // replayed
assert.equal((await handleRequest({ method: "GET", url: "/", headers: {}, raw: "" }, secret)).status, 200);
assert.equal(verifySlackSignature(secret, {}, form), false);
ok("server: valid signature → reply; forged / replayed → 401; health check 200");

console.log(`\nAll ${passed} checks passed.`);
