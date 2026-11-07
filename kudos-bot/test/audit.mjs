// Full local audit of Kudos Bot against the mission criteria + Slack platform rules.
// Run: node kudos-bot/test/audit.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const dir = new URL("../", import.meta.url);
const root = new URL("../../", import.meta.url);
let passed = 0;
const results = [];
async function check(name, fn) {
  try { await fn(); passed++; results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", `${name} → ${e.message}`]); }
}

// ---------- Criterion 1: name, description, icon ----------
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const di = manifest.display_information;

await check("C1 name present & ≤35 chars (Slack limit)", () => {
  assert.ok(di.name && di.name.length <= 35);
});
await check("C1 short description present & ≤140 chars", () => {
  assert.ok(di.description && di.description.length <= 140);
});
await check("C1 long description 175–4000 chars", () => {
  assert.ok(di.long_description.length >= 175 && di.long_description.length <= 4000);
});
await check("C1 background_color is #RRGGBB", () => {
  assert.match(di.background_color, /^#[0-9a-fA-F]{6}$/);
});
await check("C1 bot display name present & ≤80 chars", () => {
  const n = manifest.features.bot_user.display_name;
  assert.ok(n && n.length <= 80);
});
await check("C1 icon.png is a real PNG, square, 512–2000 px, <2 MB", async () => {
  const buf = await readFile(new URL("icon.png", dir));
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "not a PNG");
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  assert.equal(w, h, `not square ${w}x${h}`);
  assert.ok(w >= 512 && w <= 2000, `size ${w}`);
  const size = (await stat(new URL("icon.png", dir))).size;
  assert.ok(size < 2 * 1024 * 1024, `file ${size} bytes`);
});

// ---------- Criterion 2: least-privilege scopes ----------
await check("C2 bot scopes are exactly ['commands']", () => {
  assert.deepEqual(manifest.oauth_config.scopes.bot, ["commands"]);
});
await check("C2 no user scopes requested", () => {
  assert.equal(manifest.oauth_config.scopes.user, undefined);
});
await check("C2 recommended code uses no bot token / Web API", async () => {
  const src = await readFile(new URL("pipedream-step.mjs", dir), "utf8");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /xoxb-|Bearer|chat\.postMessage|fetch\(/);
});
await check("C2 no secrets committed anywhere", async () => {
  for (const f of ["manifest.json", "manifest-chatwrite.json", "pipedream-step.mjs", "pipedream-step-chatwrite.mjs", "server.mjs"]) {
    const s = await readFile(new URL(f, dir), "utf8");
    assert.doesNotMatch(s, /xox[abpr]-[0-9A-Za-z-]{10,}/, f);
  }
});

// ---------- Criterion 3: slash command wired to a live Request URL ----------
const cmd = manifest.features.slash_commands[0];
await check("C3 slash command '/compliment' valid (lowercase, ≤32 chars)", () => {
  assert.match(cmd.command, /^\/[a-z0-9_-]{1,31}$/);
});
await check("C3 command description ≤2000, usage_hint ≤1000", () => {
  assert.ok(cmd.description.length > 0 && cmd.description.length <= 2000);
  assert.ok(cmd.usage_hint.length <= 1000);
});
await check("C3 Request URL is https and placeholder clearly marked", () => {
  const u = new URL(cmd.url);
  assert.equal(u.protocol, "https:");
  assert.match(cmd.url, /REPLACE-WITH-YOUR-PIPEDREAM-URL/);
});
await check("C3 should_escape true (needed for @mention detection)", () => {
  assert.equal(cmd.should_escape, true);
});
await check("C3 socket mode off (HTTP Request URL used)", () => {
  assert.equal(manifest.settings.socket_mode_enabled, false);
});

// Load step
globalThis.defineComponent = (c) => c;
const stepSrc = await readFile(new URL("pipedream-step.mjs", dir), "utf8");
const step = (await import("../pipedream-step.mjs")).default;
async function call(body) {
  let r; const $ = { respond: async (x) => { r = x; } };
  await step.run({ steps: { trigger: { event: { body } } }, $ });
  return r;
}
const base = { command: "/compliment", channel_id: "C1", user_id: "U0ME", team_id: "T1" };

await check("C3 reply is immediate, 200, in_channel, <3s", async () => {
  const t = Date.now();
  const r = await call({ ...base, text: "" });
  assert.ok(Date.now() - t < 3000);
  assert.equal(r.immediate, true);
  assert.equal(r.status, 200);
  assert.equal(r.body.response_type, "in_channel");
  assert.ok(r.body.text.length > 0);
});
await check("C3 Block Kit payload valid (≤50 blocks, section ≤3000 chars)", async () => {
  const many = Array.from({ length: 10 }, (_, i) => `<@U0X${i}|x>`).join(" ");
  const r = await call({ ...base, text: many });
  assert.ok(r.body.blocks.length <= 50);
  assert.ok(r.body.blocks[0].text.text.length <= 3000);
  assert.equal(r.body.blocks[1].type, "context");
});
await check("C3 1000 random runs: never empty, never crashes", async () => {
  const inputs = ["", "help", "code", "<@U0A|a>", "<@U0A|a> <@U0B|b> design", "random words", "<#C123|general>", "<!here>"];
  for (let i = 0; i < 1000; i++) {
    const r = await call({ ...base, text: inputs[i % inputs.length] });
    assert.ok(r.body.text && r.body.text.length > 0);
  }
});
await check("C3 missing body handled (no crash)", async () => {
  let r; const $ = { respond: async (x) => { r = x; } };
  await step.run({ steps: { trigger: { event: {} } }, $ });
  assert.equal(r.status, 200);
});
await check("C3 does not ping @here/@channel from user text", async () => {
  const r = await call({ ...base, text: "<!channel> <!here>" });
  assert.doesNotMatch(r.body.text, /<!/);
});

// ---------- Security: Slack signature verification (official Slack test vector) ----------
const { verifySlackSignature, handleRequest } = await import("../server.mjs");
await check("SEC signature matches Slack's official documentation example", () => {
  const secret = "8f742231b10e8888abcd99yyyzzz85a5";
  const ts = "1531420618";
  const body = "token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c";
  const sig = "v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503";
  assert.equal(verifySlackSignature(secret, { "x-slack-request-timestamp": ts, "x-slack-signature": sig }, body, Number(ts)), true);
  assert.equal(verifySlackSignature(secret, { "x-slack-request-timestamp": ts, "x-slack-signature": sig }, body + "x", Number(ts)), false);
});
await check("SEC unsigned / unknown routes rejected", async () => {
  assert.equal((await handleRequest({ method: "POST", url: "/slack/commands", headers: {}, raw: "a=b" }, "s")).status, 401);
  assert.equal((await handleRequest({ method: "GET", url: "/nope", headers: {}, raw: "" }, "s")).status, 404);
});

// ---------- Alternative chat:write step (mocked Slack Web API) ----------
await check("ALT chat:write step: token from env, posts to channel, hints on not_in_channel", async () => {
  const alt = (await import("../pipedream-step-chatwrite.mjs")).default;
  process.env.SLACK_BOT_TOKEN = "test-token";
  const calls = [];
  const realFetch = globalThis.fetch;
  let mode = "ok";
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    const data = url.includes("chat.postMessage") ? (mode === "ok" ? { ok: true } : { ok: false, error: mode === "fail" ? "not_in_channel" : "invalid_auth" }) : {};
    return { json: async () => data };
  };
  try {
    const $ = { respond: async () => {} };
    const ev = { steps: { trigger: { event: { body: { ...base, response_url: "https://hooks.slack.com/x" } } } }, $ };
    await alt.run(ev);
    assert.equal(calls[0].url, "https://slack.com/api/chat.postMessage");
    assert.equal(calls[0].opts.headers.Authorization, "Bearer test-token");
    assert.equal(JSON.parse(calls[0].opts.body).channel, "C1");
    calls.length = 0; mode = "fail";
    await alt.run(ev);
    assert.equal(calls[1].url, "https://hooks.slack.com/x");
    assert.match(JSON.parse(calls[1].opts.body).text, /invite/);
    calls.length = 0; mode = "other";
    await alt.run(ev);
    assert.equal(calls.length, 2);
    calls.length = 0;
    await alt.run({ steps: { trigger: { event: { body: { ssl_check: "1" } } } }, $ });
    assert.equal(calls.length, 0, "ssl_check must not call Slack");
    await alt.run({ steps: { trigger: { event: {} } }, $ }); // missing body: no crash
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.SLACK_BOT_TOKEN;
  }
});

// ---------- Criterion 4 + submission ----------
await check("C4 README has install + test steps for sandbox", async () => {
  const r = await readFile(new URL("README.md", root), "utf8");
  for (const s of ["developer-program", "Install to Workspace", "/compliment help", "From a manifest"]) assert.ok(r.includes(s), s);
});
await check("SUB Version A ≤500 chars, names scope + reason + next step", async () => {
  const parts = (await readFile(new URL("SUBMISSION.md", root), "utf8")).split("**Description (paste as-is):**");
  const a = parts[1].split("---")[0].trim();
  assert.ok(a.length > 100 && a.length <= 500, `${a.length} chars`);
  assert.match(a, /commands/);
  assert.match(a, /because/);
  assert.match(a, /Next/);
});
await check("SUB Version B ≤500 chars, names chat:write + reason + next step", async () => {
  const parts = (await readFile(new URL("SUBMISSION.md", root), "utf8")).split("**Description (paste as-is):**");
  const b = parts[2].trim();
  assert.ok(b.length > 100 && b.length <= 500, `${b.length} chars`);
  assert.match(b, /chat:write/);
  assert.match(b, /because/);
  assert.match(b, /Next/);
});

// ---------- Track B (course-exact) manifest ----------
const mB = JSON.parse(await readFile(new URL("manifest-chatwrite.json", dir), "utf8"));
await check("B manifest scopes exactly ['chat:write','commands'] (no chat:write.public)", () => {
  assert.deepEqual([...mB.oauth_config.scopes.bot].sort(), ["chat:write", "commands"]);
  assert.equal(mB.oauth_config.scopes.user, undefined);
});
await check("B manifest identity matches A and is within Slack limits", () => {
  for (const k of ["name", "description", "background_color"]) assert.equal(mB.display_information[k], di[k], k);
  const ld = mB.display_information.long_description.length;
  assert.ok(ld >= 175 && ld <= 4000);
});
await check("B manifest slash command valid, escaped, socket mode off", () => {
  const c = mB.features.slash_commands[0];
  assert.equal(c.command, "/compliment");
  assert.equal(c.should_escape, true);
  assert.equal(new URL(c.url).protocol, "https:");
  assert.equal(mB.settings.socket_mode_enabled, false);
});
await check("B code reads token from env, no hard-coded token or placeholder", async () => {
  const s = await readFile(new URL("pipedream-step-chatwrite.mjs", dir), "utf8");
  assert.match(s, /process\.env\.SLACK_BOT_TOKEN/);
  assert.doesNotMatch(s, /YOUR-BOT-TOKEN|xoxb-/);
});

// ---------- Docs / repo hygiene ----------
await check("README covers sandbox event code, both tracks, add-bot-to-channel", async () => {
  const r = await readFile(new URL("README.md", root), "utf8");
  for (const s of ["HANDSHAKE_SLACK1", "Track A", "Track B", "Add to channel", "Return a custom response", "Escape channels, users, and links"]) assert.ok(r.includes(s), s);
});
await check(".gitignore excludes .env and node_modules", async () => {
  const g = await readFile(new URL(".gitignore", root), "utf8");
  assert.match(g, /^\.env$/m);
  assert.match(g, /^node_modules\/$/m);
});

// ---------- Report ----------
for (const [s, n] of results) console.log(`${s === "PASS" ? "✔" : "✘"} ${n}`);
const failed = results.length - passed;
console.log(`\n${passed}/${results.length} audit checks passed${failed ? ` — ${failed} FAILED` : ""}.`);
process.exit(failed ? 1 : 0);

