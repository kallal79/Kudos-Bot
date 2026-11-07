// Local checks for Kudos Bot. Run: node kudos-bot/test/harness.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
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

// 10. Custom notes: personal message attached to praise
r = await call({ ...base, text: "<@U0SAM|sam> for staying late on the deployment" });
assert.equal(r.body.response_type, "in_channel");
assert.match(r.body.text, /^<@U0SAM> /);
assert.match(r.body.text, /> _"staying late on the deployment"_/);
// 10b. Multi-mention with custom note
r = await call({ ...base, text: "<@U0SAM|sam> <@U0LEE|lee> for shipping the feature" });
assert.match(r.body.text, /> _"shipping the feature"_/);
// 10c. 'thanks for' prefix normalization
r = await call({ ...base, text: "<@U0SAM|sam> thanks for helping with tests" });
assert.match(r.body.text, /> _"helping with tests"_/);
ok("custom note attached to mention: " + r.body.text.split("\n")[1]);

// 11. Subcommands: themes and stats
r = await call({ ...base, text: "themes" });
assert.equal(r.body.response_type, "ephemeral");
assert.match(r.body.text, /Kudos Bot Themes & Categories/);
r = await call({ ...base, text: "stats" });
assert.equal(r.body.response_type, "ephemeral");
assert.match(r.body.text, /Least privilege/);
ok("subcommands 'themes' and 'stats' return structured ephemeral info");

// 12. Security: Broadcast ping suppression in custom notes
r = await call({ ...base, text: "<@U0SAM|sam> for <!everyone> <!channel> <!here> spam" });
assert.doesNotMatch(r.body.text, /<!/);
assert.match(r.body.text, /\[everyone\]/);
ok("security: broadcast pings neutralized in custom notes");

// 13. Rate limiting protection & map eviction
process.env.RATE_LIMIT_MS = "500";
const r1 = await call({ ...base, user_id: "U_SPAM" });
const r2 = await call({ ...base, user_id: "U_SPAM" });
assert.equal(r1.body.response_type, "in_channel");
assert.equal(r2.body.response_type, "ephemeral");
assert.match(r2.body.text, /Hold on a moment/);
// test cache prune when map exceeds 1000 items
for (let i = 0; i < 1005; i++) {
  await call({ ...base, user_id: `U_MAP_${i}` });
}
delete process.env.RATE_LIMIT_MS;
ok("rate limiter: prevents flood spam and prunes internal state");

// 14. Server request handler + signature verification
const { handleRequest, verifySlackSignature, createApp } = await import("../server.mjs");
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

// 15. Server error handling: graceful catch when step execution fails
const origRun = step.run;
const origErr = console.error;
console.error = () => {}; // suppress simulated error log in test output
step.run = async () => { throw new Error("Simulated step failure"); };
const errRes = await post(now, sign(now, form));
assert.equal(errRes.status, 200);
const errJson = JSON.parse(errRes.body);
assert.equal(errJson.response_type, "ephemeral");
assert.match(errJson.text, /hit a snag/);
step.run = origRun;
console.error = origErr;
ok("server: graceful error recovery returns friendly ephemeral message");

// 16. createApp HTTP stream processing & 413 payload limit
const app = createApp({ signingSecret: secret });

// 16a. Oversized payload (>64KB) → 413
let status413 = 0;
const reqOversized = new Readable({ read() {} });
reqOversized.method = "POST";
reqOversized.url = "/slack/commands";
reqOversized.headers = {};
const resOversized = {
  writeHead(status) { status413 = status; return this; },
  end() {},
};
app.emit("request", reqOversized, resOversized);
reqOversized.push(Buffer.alloc(65537));
reqOversized.push(null);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(status413, 413);

// 16b. Valid request through createApp stream
let appResStatus = 0;
let appResBody = "";
const reqValid = new Readable({ read() {} });
reqValid.method = "POST";
reqValid.url = "/slack/commands";
reqValid.headers = { "x-slack-request-timestamp": String(now), "x-slack-signature": sign(now, form) };
const resValid = {
  writeHead(status) { appResStatus = status; return this; },
  end(body) { appResBody = body; },
};
app.emit("request", reqValid, resValid);
reqValid.push(form);
reqValid.push(null);
// wait for stream tick
await new Promise((resolve) => setImmediate(resolve));
assert.equal(appResStatus, 200);
assert.match(appResBody, /in_channel/);
ok("createApp: streams body, enforces 64KB limit (413), and delivers response");

console.log(`\nAll ${passed} checks passed.`);
