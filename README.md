# Kudos Bot 💐

A lightweight Slack app that brings quick peer appreciation into your workspace. Anyone in a channel can type `/compliment @teammate` to drop a friendly, public shoutout right in the channel.

Built with **strict least privilege** in mind: it uses only the `commands` scope, needs zero stored bot tokens, and never reads your channel messages.

<p align="center">
  <img src="kudos-bot/icon.png" width="128" height="128" alt="Kudos Bot App Icon" style="border-radius: 24px;" />
</p>

---

## What it does

| Command | What happens |
|---|---|
| `/compliment` | Posts a random, friendly compliment to the channel |
| `/compliment @sam` | Aims the compliment at a specific teammate |
| `/compliment @sam for staying late on release day` | Includes your own personal note in a Block Kit quote |
| `/compliment @sam @lee teamwork` | Gives multiple teammates unique themed compliments at once |
| `/compliment themes` | Lists available categories (`general`, `code`, `teamwork`, `leadership`, `design`) |
| `/compliment stats` | Shows app metrics, active scopes, and response stats |
| `/compliment help` | Shows quick command tips (only visible to you) |

### Built-in safety
- **No broadcast storms:** Any attempt to mention `<!everyone>`, `<!channel>`, or `<!here>` inside a custom note is converted to plain text (`[everyone]`), preventing accidental company-wide notification blasts.
- **Flood guard:** Includes a simple cooldown per user to prevent accidental double-submits.

---

## Two ways to build it

This project includes two implementations so you can choose what fits best:

| | **Track A (Recommended)** | **Track B (Course-exact)** |
|---|---|---|
| **Bot scopes** | `commands` | `chat:write` (+ auto-added `commands`) |
| **Manifest** | `kudos-bot/manifest.json` | `kudos-bot/manifest-chatwrite.json` |
| **Code file** | `kudos-bot/pipedream-step.mjs` | `kudos-bot/pipedream-step-chatwrite.mjs` |
| **Bot token needed?** | **No** (nothing to leak) | Yes (saved in Pipedream env var) |
| **Channel invite?** | **No** (works anywhere) | Yes (`/invite @Kudos Bot`) |
| **Why choose it?** | Purest least privilege, simplest setup | Matches the guided tutorial step-for-step |

> **Why doesn't Track A need `chat:write`?**  
> When a user runs a slash command, Slack lets the app reply directly with `"response_type": "in_channel"`. Slack's server then posts the message on behalf of the bot. Because we only respond to direct slash command requests, we don't need standing permission to post unprompted messages or store an active bot token. See [MARKET_ANALYSIS.md](MARKET_ANALYSIS.md) for full design notes.

---

## Setup Guide (≈15 minutes)

### 1. Create your free Slack developer sandbox
1. Head to [api.slack.com/developer-program](https://api.slack.com/developer-program) and click **Join the Program**.
2. Activate your account from the confirmation email and go to the dashboard.
3. Click the green **Provision Sandbox** button:
   - Enter a sandbox name (e.g. `kudos-test-space`).
   - Use Event Code: **`HANDSHAKE_SLACK1`**.
   - Keep the default data template, then confirm with the code emailed to you.
4. Go to the **Sandboxes** tab, open your sandbox in Slack, and create a channel like `#kudos-test`.

### 2. Set up your Pipedream webhook
1. Sign up for a free account at [pipedream.com](https://pipedream.com).
2. Go to **Projects** → create a project (e.g. `kudos-bot`) → click **New Workflow**.
3. Choose the **HTTP / Webhook** trigger, then **New Requests**.
   - In trigger settings, change **HTTP Response** to **"Return a custom response from your workflow"**.
4. Copy the trigger URL (`https://...m.pipedream.net`).
5. Click **+** → **Run custom code** → **Node.js**:
   - **Track A:** Paste the contents of `kudos-bot/pipedream-step.mjs`.
   - **Track B:** Paste `kudos-bot/pipedream-step-chatwrite.mjs`. (Under workflow Settings → Environment Variables, add `SLACK_BOT_TOKEN` with your `xoxb-...` token after step 4).
6. Click **Deploy** in the top right.

### 3. Create the Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**.
2. Pick **From a manifest**, choose your sandbox workspace, and paste the JSON from `kudos-bot/manifest.json` (Track A) or `kudos-bot/manifest-chatwrite.json` (Track B).
   - Replace the `REPLACE-WITH-YOUR-PIPEDREAM-URL` placeholder with your actual Pipedream trigger URL.
3. Under **Basic Information → Display Information**, upload `kudos-bot/icon.png` and save changes.
4. Make sure **Escape channels, users, and links** is checked under your Slash Command settings so `@mentions` are parsed cleanly.

### 4. Install and test
1. Go to **Install App** in the left menu and click **Install to Workspace** → **Allow**.
2. In your Slack `#kudos-test` channel:
   - For Track B: Type `@Kudos Bot` and choose **Add to channel**.
   - Type `/compliment` and press Enter. You should see a random compliment appear in the channel!
   - Try: `/compliment @yourname for helping with testing`
   - Try: `/compliment help` to see private usage tips.
3. Take a screenshot of the response in your channel for your submission.

---

## Local Development & Testing

You can run the full test suite and an interactive terminal Slack simulator locally without creating any accounts.

```powershell
# Run feature unit tests and platform constraint audits
npm test

# Run the local Slack simulator (prints formatted conversation + creates preview.html)
npm run demo

# Run the real HTTP server test on 127.0.0.1
npm run test:e2e

# Run test coverage (100% on app code)
npm run coverage
```

### Self-hosting with Node.js
If you prefer hosting on your own server (Docker, Render, Railway, etc.) instead of Pipedream, Kudos Bot includes a zero-dependency HTTP server with HMAC-SHA256 signature verification:

```powershell
$env:SLACK_SIGNING_SECRET="your_signing_secret"
npm start
```
Deployment blueprints are included:
- `Dockerfile` & `docker-compose.yml`
- `render.yaml`
- `railway.json`

---

## Troubleshooting

| What happened | How to fix it |
|---|---|
| `/compliment failed with "dispatch_failed"` | The Request URL in Slack doesn't match your Pipedream URL, or your Pipedream workflow is still in draft (click **Deploy**). |
| `operation_timeout` | Your trigger is not set to **"Return a custom response from your workflow"**. |
| Bot isn't posting (Track B only) | The bot must be added to the channel first (`/invite @Kudos Bot`), or the `SLACK_BOT_TOKEN` has spaces. |
| Mentions arrive as plain text | Ensure **Escape channels, users, and links** is checked in your Slash Command settings. |
| Changed scopes but nothing updated | Any scope change in Slack requires you to reinstall the app (**Install App → Reinstall**). |

---

## Project Structure

```
├── kudos-bot/
│   ├── manifest.json                  # App manifest for Track A (commands scope)
│   ├── manifest-chatwrite.json        # App manifest for Track B (chat:write scope)
│   ├── icon.png                       # 1024x1024 app icon
│   ├── pipedream-step.mjs             # Recommended serverless handler
│   ├── pipedream-step-chatwrite.mjs   # Alternative Web API handler
│   ├── server.mjs                     # Optional standalone Node.js server
│   ├── demo.mjs                       # Local Slack simulator
│   └── test/
│       ├── harness.mjs                # Feature unit tests
│       ├── audit.mjs                  # Slack platform and rule compliance checks
│       └── e2e.mjs                    # End-to-end HTTP socket tests
├── Dockerfile                         # Container configuration
├── docker-compose.yml                 # Local container orchestration
├── MARKET_ANALYSIS.md                 # Architecture and design notes
├── SUBMISSION.md                      # Handshake title & description text
└── README.md                          # Project documentation
```
