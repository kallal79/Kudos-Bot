// Kudos Bot — local Slack simulator.
// Sends REAL Slack-signed slash-command requests through server.mjs's handler,
// prints the conversation like a Slack channel, and writes kudos-bot/preview.html
// (a Slack-style rendering you can open in a browser and screenshot).
//
// Run: npm run demo

import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
import { handleRequest } from "./server.mjs";

const SECRET = "local-demo-secret";
const USERS = { U0ME: "you", U0SAM: "sam", U0LEE: "lee", U0ANA: "ana" };
const C = { dim: "\x1b[2m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m", cyan: "\x1b[36m", yellow: "\x1b[33m", reset: "\x1b[0m" };

const scenarios = [
  { label: "Plain compliment", text: "" },
  { label: "Aimed at a teammate", text: "<@U0SAM|sam>" },
  { label: "Custom personal note", text: "<@U0SAM|sam> for staying late on the deployment" },
  { label: "Two teammates, themed", text: "<@U0SAM|sam> <@U0LEE|lee> teamwork" },
  { label: "Multi-person with personal note", text: "<@U0SAM|sam> <@U0LEE|lee> thanks for shipping the release" },
  { label: "Theme only", text: "code" },
  { label: "Leadership for Ana", text: "<@U0ANA|ana> leadership" },
  { label: "Themes list (private)", text: "themes" },
  { label: "Stats (private)", text: "stats" },
  { label: "Help (private)", text: "help" },
];

function sign(ts, body) {
  return "v0=" + crypto.createHmac("sha256", SECRET).update(`v0:${ts}:${body}`).digest("hex");
}

async function slash(text, { forge = false } = {}) {
  const raw = new URLSearchParams({
    token: "unused", team_id: "T0DEMO", channel_id: "C0KUDOS", channel_name: "kudos-test",
    user_id: "U0ME", user_name: "you", command: "/compliment", text,
    response_url: "https://hooks.slack.com/commands/demo", trigger_id: "1.2.3",
  }).toString();
  const ts = String(Math.floor(Date.now() / 1000));
  const t0 = performance.now();
  const res = await handleRequest({
    method: "POST", url: "/slack/commands", raw,
    headers: { "x-slack-request-timestamp": ts, "x-slack-signature": forge ? sign(ts, raw + "tampered") : sign(ts, raw) },
  }, SECRET);
  return { ...res, ms: performance.now() - t0 };
}

// Slack mrkdwn → plain terminal text / safe HTML
const toPlain = (s) => s.replace(/<@([A-Z0-9]+)(\|[^>]*)?>/g, (_, id) => `@${USERS[id] ?? id}`).replace(/\*([^*]+)\*/g, "$1");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (s) => esc(s)
  .replace(/&lt;@([A-Z0-9]+)(\|[^&]*)?&gt;/g, (_, id) => `<span class="mention">@${USERS[id] ?? id}</span>`)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*([^*]+)\*/g, "<b>$1</b>")
  .replace(/\n/g, "<br>");
const typed = (text) => "/compliment " + toPlain(text);

console.log(`\n${C.bold}#kudos-test${C.reset}  ${C.dim}(local Slack simulator · signed requests → server.mjs → pipedream-step.mjs)${C.reset}\n`);

const rows = [];
let pass = 0;
for (const s of scenarios) {
  const r = await slash(s.text);
  const json = JSON.parse(r.body);
  const ok = r.status === 200 && json.text;
  if (ok) pass++;
  const vis = json.response_type === "in_channel" ? `${C.green}visible to everyone${C.reset}` : `${C.yellow}only visible to you${C.reset}`;
  console.log(`${C.cyan}you${C.reset}  ${C.dim}${typed(s.text).trim()}${C.reset}`);
  console.log(`${C.bold}Kudos Bot${C.reset} ${C.dim}APP · ${vis}${C.dim} · ${r.status} in ${r.ms.toFixed(1)} ms${C.reset}`);
  for (const line of toPlain(json.text).split("\n")) console.log("  " + line);
  if (json.blocks?.[1]) console.log(`  ${C.dim}${toPlain(json.blocks[1].elements[0].text).replace(/`/g, "")}${C.reset}`);
  console.log();
  rows.push({ s, json });
}

// Security scenario
const forged = await slash("", { forge: true });
const secOk = forged.status === 401;
console.log(`${C.dim}attacker  forged signature →${C.reset} ${secOk ? C.green : C.red}${forged.status} ${forged.body}${C.reset}\n`);

console.log(`${pass === scenarios.length && secOk ? C.green + "✔" : C.red + "✘"} ${pass}/${scenarios.length} replies delivered, forged request ${secOk ? "blocked" : "NOT blocked"}${C.reset}`);

// ---------- HTML preview ----------
const msgs = rows.map(({ s, json }) => {
  const isPublic = json.response_type === "in_channel";
  const footer = json.blocks?.[1] ? `<div class="ctx">${toHtml(json.blocks[1].elements[0].text)}</div>` : "";
  return `
  <div class="msg"><div class="av you">Y</div><div><div class="hdr"><b>you</b><span class="time">just now</span></div>
    <div class="cmd">${esc(typed(s.text).trim())}</div></div></div>
  <div class="msg ${isPublic ? "" : "eph"}"><img class="av" src="icon.png" alt=""><div>
    <div class="hdr"><b>Kudos Bot</b><span class="app">APP</span><span class="time">just now</span>${isPublic ? "" : '<span class="only">Only visible to you</span>'}</div>
    <div class="txt">${toHtml(json.text)}</div>${footer}</div></div>`;
}).join("\n");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Kudos Bot — #kudos-test preview</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;font:15px/1.46668 -apple-system,"Segoe UI",Lato,Helvetica,Arial,sans-serif;background:#f8f8f8;color:#1d1c1d}
  .wrap{max-width:900px;margin:24px auto;background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px #0001}
  header{padding:14px 20px;border-bottom:1px solid #e8e8e8;font-weight:900;font-size:18px}
  header small{font-weight:400;color:#616061;font-size:13px;margin-left:8px}
  .msg{display:flex;gap:10px;padding:8px 20px}
  .msg:hover{background:#f8f8f8}
  .av{width:36px;height:36px;border-radius:6px;flex:none}
  .av.you{background:#4a154b;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}
  .hdr b{font-weight:900}.time{color:#616061;font-size:12px;margin-left:8px}
  .app{background:#e8e8e8;color:#616061;font-size:10px;font-weight:700;padding:1px 4px;border-radius:2px;margin-left:6px}
  .only{color:#616061;font-size:12px;margin-left:8px;font-style:italic}
  .cmd{color:#616061}
  .eph{background:#f4f9fd}
  .mention{background:#e8f5fa;color:#1264a3;border-radius:3px;padding:0 2px}
  code{background:#f6f6f6;border:1px solid #ddd;border-radius:3px;padding:0 3px;color:#e01e5a;font-size:12px}
  .ctx{color:#616061;font-size:12px;margin-top:4px}
  footer{padding:10px 20px;border-top:1px solid #e8e8e8;color:#616061;font-size:12px}
</style></head><body><div class="wrap">
<header># kudos-test<small>Kudos Bot · scope: commands only · generated ${new Date().toLocaleString()}</small></header>
${msgs}
<footer>Rendered from real responses produced by pipedream-step.mjs via signed requests to server.mjs (npm run demo).</footer>
</div></body></html>`;

const out = new URL("./preview.html", import.meta.url);
await writeFile(out, html);
console.log(`${C.dim}Slack-style preview written to ${decodeURIComponent(out.pathname).replace(/^\/([A-Za-z]:)/, "$1")}${C.reset}\n`);
process.exit(pass === scenarios.length && secOk ? 0 : 1);

