# Kudos Bot — Custom Slack App
**Handshake mission: Build and Deploy a Custom Slack App**

Type `/compliment` in any channel → Kudos Bot posts a random, work-friendly compliment the whole team can see.

![Kudos Bot icon](kudos-bot/icon.png)

---

## ✅ Mission criteria → how this project meets them

| # | Requirement | How it's met | Verified by |
|---|---|---|---|
| 1 | Its own **name, description, and icon** | `Kudos Bot`, short + long description, `#d9534f` color, 1024×1024 `icon.png` | `audit.mjs` (Slack length limits, PNG size/shape) |
| 2 | **Only the bot scope(s) it needs** | Track A: `commands` only · Track B (course-exact): `chat:write` (+ `commands`, which Slack adds automatically for any slash command). No `chat:write.public`, no read scopes, no user scopes. | `audit.mjs` (exact scope lists) |
| 3 | **Slash command wired to a live Request URL** that posts a real reply to the channel | `/compliment` → Pipedream HTTP trigger → public (`in_channel`) reply | `harness.mjs`, `audit.mjs`, `e2e.mjs` |
| 4 | **Real install & test in the Slack developer sandbox** | Steps I–V below (needs your own Slack + Pipedream login) | Your screenshot |

**Local test results:** `npm test` → 10/10 unit + 32/32 audit ✔ · `npm run test:e2e` → 4/4 real-HTTP ✔ · `npm run demo` → 6/6 replies + forged request blocked ✔ · app logic 100% line coverage

---

## Pick your track (both pass every criterion)

| | **Track A — Recommended (least privilege)** | **Track B — Course-exact** |
|---|---|---|
| Bot scopes | `commands` | `chat:write` (+ `commands` auto-added) |
| Manifest | `kudos-bot/manifest.json` | `kudos-bot/manifest-chatwrite.json` |
| Pipedream code | `kudos-bot/pipedream-step.mjs` | `kudos-bot/pipedream-step-chatwrite.mjs` |
| Bot token needed? | **No** — nothing to leak | Yes — stored as Pipedream env var `SLACK_BOT_TOKEN` (never in code) |
| Must add bot to channel? | **No** — works in any channel / DM | Yes — `@Kudos Bot` → *Add to channel* |
| Extras | `@mentions`, themes, `help`, Block Kit "Sent by" footer | Private fix-it hint on `not_in_channel` |
| Submission text | `SUBMISSION.md` → Version A | `SUBMISSION.md` → Version B |

**Why A is the stronger answer:** the course rule is *"grant only what today's function needs."* Slack requires `commands` for any slash command, and a slash command can reply publicly to its own channel with `"response_type": "in_channel"` — so posting needs **no extra scope at all**. Track A uses one permission instead of two, stores no token, and can't fail with `not_in_channel`.
**Choose B** if you want your screens to match the course guide exactly (it says "chat:write is all you need").

---

## How it compares to existing Slack kudos tools

| Tool | What it is | Trade-off vs. Kudos Bot |
|---|---|---|
| HeyTaco, Bonusly, Matter, Kudos-style platforms | Full recognition platforms (points, rewards, dashboards) | Powerful, but broader permissions, accounts, and paid tiers for advanced features. Overkill for "post a compliment". |
| Slack Workflow Builder | No-code workflows inside Slack | Not a custom app with its own Request URL; doesn't satisfy this mission. |
| Course sample code | 3 compliments, token pasted in code | Works, but token in plain text, two scopes, silent failure if the bot isn't in the channel. |
| **Kudos Bot (this repo)** | Single-purpose, least-privilege app | 1 scope, no stored secret (Track A), mentions + themes, signature-verified self-host option, 46 automated checks. |

---

## Step-by-step build (≈20 min)

### I. Set up your sandbox
1. Go to https://api.slack.com/developer-program → **Join the Program** → submit your personal email (no credit card).
2. Open the email **"[Slack] Welcome to Slack Developer Program"** → **Activate Developer Account / Visit Dashboard**.
3. Click the green **Provision Sandbox** → enter a sandbox name, keep the suggested domain, **Event Code: `HANDSHAKE_SLACK1`**, keep the default data template → enter the confirmation code from your inbox.
4. **Sandboxes** tab → open your sandbox → sign in. Create a test channel, e.g. `#kudos-test`.

### II. Create the app & its identity
1. https://api.slack.com/apps → **Create New App** → **From scratch / Blank App** → name `Kudos Bot` → pick your **sandbox** workspace → **Create**. (Accept the sandbox token notice.)
   *Shortcut:* **From a manifest** → paste `manifest.json` (Track A) or `manifest-chatwrite.json` (Track B) → skip to step II-3 and III-3.
2. **Basic Information → Display Information**:
   - App name: `Kudos Bot`
   - Short description: `Type /compliment and Kudos Bot posts a random compliment for the whole channel.`
   - App icon: upload `kudos-bot/icon.png` · Background color: `#d9534f`
   - **Save Changes**

### III. Grant only what the command needs
1. **OAuth & Permissions → Bot Token Scopes**:
   - **Track A:** add nothing here — Slack adds `commands` automatically when you create the slash command.
   - **Track B:** add **`chat:write`** only. Don't add `chat:write.public` or anything else.
2. **Slash Commands → Create New Command** (if Slack says Socket Mode is on, turn it off under **Socket Mode** first):
   - Command `/compliment`
   - Request URL `https://example.com` (placeholder, replaced in IV)
   - Short description `Post a random compliment to the channel`
   - Usage hint (Track A) `[@teammate ...] [code|teamwork|leadership|design] or help`
   - ✅ **Escape channels, users, and links sent to your app**
   - **Save**
3. Check **Features → App Manifest**: `oauth_config.scopes.bot` should be `["commands"]` (A) or `["chat:write","commands"]` (B).

### IV. Install & wire up the live endpoint
1. **Settings → Install App → Install to Workspace** → review the scopes → **Allow**.
   - **Track B only:** copy the **Bot User OAuth Token** (`xoxb-…`). Never paste it into a repo, doc, or channel.
2. https://pipedream.com → free account (choose **Connectors**, close any install popup) → **Projects** → new project → **New Workflow**.
3. Trigger: **HTTP / Webhook → New Requests**. In the trigger's settings, set **HTTP Response** to **"Return a custom response from your workflow"**. Copy the trigger URL.
4. **+ → Run custom code → Node.js** → delete the sample → paste:
   - Track A: all of `kudos-bot/pipedream-step.mjs`
   - Track B: all of `kudos-bot/pipedream-step-chatwrite.mjs`, then go to **Settings → Environment Variables** and add `SLACK_BOT_TOKEN` = your `xoxb-…` token
5. **Deploy** (top right). Not just save — deploy.
6. Slack → **Slash Commands → edit `/compliment`** → replace the Request URL with your Pipedream URL → **Save**. (No reinstall needed for URL changes.)

### V. Ship it — test in your sandbox
1. In `#kudos-test`:
   - **Track B:** first type `@Kudos Bot` → **Add to channel**.
   - Run `/compliment` → a compliment appears for everyone.
   - Track A extras: `/compliment @yourname teamwork`, `/compliment @a @b code`, `/compliment help` (private).
2. Read it. Want a different tone? Edit the compliments array in Pipedream → **Deploy** → retry.
3. Screenshot the reply (**Win + Shift + S**). Cover image: 3:2, ≥1200 px wide (or use `icon.png`).

### VI. Submit on Handshake
Paste the title + the description matching your track from `SUBMISSION.md`, upload the screenshot, tick **Share to Showcase**, **Publish**.

---

## Troubleshooting (in order)

| Symptom | Fix |
|---|---|
| `dispatch_failed` | Request URL doesn't exactly match the Pipedream URL, or the workflow isn't **deployed**. |
| `operation_timeout` | Trigger HTTP Response isn't set to "Return a custom response from your workflow". |
| Nothing posts (Track B) | Bot not in channel (`@Kudos Bot` → Add), token has spaces or is missing from `SLACK_BOT_TOKEN`, or `chat:write` wasn't granted before install. |
| You see "I'm not in this channel yet…" | Track B hint working as designed → add the bot to the channel. |
| Mentions not detected (Track A) | Turn on **Escape channels, users, and links** on the command. |
| Changed scopes, nothing different | Scope changes need **reinstall** (Install App → Reinstall). |

---

## Optional: self-host instead of Pipedream
```powershell
$env:SLACK_SIGNING_SECRET="your-signing-secret"; npm start
```
Deploy to Render/Railway/Fly (start command `npm start`, Node 18+). Request URL: `https://your-host/slack/commands`. The Signing Secret is in **Basic Information → App Credentials**. Every request is HMAC-SHA256 verified, and anything older than 5 minutes is rejected.

Optional hardening for Pipedream: add env var `ALLOWED_TEAM_ID` = your workspace's `team_id` (visible in the trigger event) so other workspaces can't use your endpoint.

---

## Project files

| File | Purpose |
|---|---|
| `kudos-bot/manifest.json` | Track A app definition (scope: `commands`) |
| `kudos-bot/manifest-chatwrite.json` | Track B app definition (scopes: `chat:write`, `commands`) |
| `kudos-bot/icon.png` | 1024×1024 icon |
| `kudos-bot/pipedream-step.mjs` | Track A Pipedream code (no token) |
| `kudos-bot/pipedream-step-chatwrite.mjs` | Track B Pipedream code (token from env var) |
| `kudos-bot/server.mjs` | Optional zero-dependency self-hosted endpoint with signature verification |
| `kudos-bot/demo.mjs` | Local Slack simulator + `preview.html` generator |
| `kudos-bot/test/harness.mjs` | Unit tests |
| `kudos-bot/test/audit.mjs` | Criteria + Slack-limits audit (incl. Slack's official signature test vector) |
| `kudos-bot/test/e2e.mjs` | Real HTTP test on localhost |
| `SUBMISSION.md` | Ready-to-paste Handshake text (Version A and B) |

## Run the checks
```powershell
npm run demo        # local Slack simulator → prints the channel + writes kudos-bot/preview.html
npm test            # unit (10) + audit (32)
npm run test:e2e    # real HTTP round-trip on 127.0.0.1 (4)
npm run coverage    # Node built-in coverage: app logic 100% lines
npm run check       # test + demo + coverage in one go
```

### See it before you deploy
`npm run demo` sends real **Slack-signed** requests through the same code Pipedream runs, and prints the replies like a channel:
```
you  /compliment @sam @lee teamwork
Kudos Bot APP · visible to everyone · 200 in 1.3 ms
  • @sam — You give credit generously — and deserve plenty back.
  • @lee — You bring calm to every fire drill.
  Sent by @you with /compliment · theme: teamwork

attacker  forged signature → 401 invalid signature
✔ 6/6 replies delivered, forged request blocked
```
Open `kudos-bot/preview.html` in your browser for a Slack-style rendering (with the real icon). It's handy as a cover image, but your submission screenshot should come from the real sandbox.
