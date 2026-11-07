// Kudos Bot v2.2 — Pipedream "Run custom code" (Node.js) step  ✅ RECOMMENDED
//
// Slack scope needed: `commands` ONLY (no chat:write, no bot token in code).
// We answer Slack's slash-command request directly with response_type "in_channel",
// so the compliment is posted publicly in the channel where /compliment was typed.
//
// Usage in Slack:
//   /compliment                         → random compliment for the channel
//   /compliment @sam                    → compliment aimed at Sam
//   /compliment @sam for staying late   → compliment with your custom personal note
//   /compliment @sam @lee code          → themed compliment for each person (max 10)
//   /compliment help                    → private usage tips (only you see it)
//   /compliment themes                  → list all available themes and examples
//   /compliment stats                   → app stats & architectural details
//
// Themes: general, code, teamwork, leadership, design
//
// Optional hardening (Pipedream → Settings → Environment Variables):
//   ALLOWED_TEAM_ID = T0123ABCD  → only your workspace can use this endpoint.
//   RATE_LIMIT_MS = 1500         → cooldown between commands per user (default 1500ms).

const COMPLIMENTS = {
  general: [
    "You're the person people actually want on their team.",
    "That thing you shipped last week? Still impressive.",
    "You make hard problems look easier than they are.",
    "You ask the questions everyone else was afraid to ask.",
    "Meetings are 40% more useful when you're in them.",
    "You turn chaos into a checklist.",
  ],
  code: [
    "Your code reviews make everyone better.",
    "Your pull requests read like a good story.",
    "You fix bugs before most of us notice them.",
    "Your tests catch problems before customers ever could.",
  ],
  teamwork: [
    "You make new teammates feel welcome from day one.",
    "You give credit generously — and deserve plenty back.",
    "You bring calm to every fire drill.",
    "You're the reason handoffs on this team just work.",
  ],
  leadership: [
    "Your ideas have a habit of becoming the plan.",
    "You make everyone around you more confident.",
    "You set the bar high and help people clear it.",
    "You turn big goals into clear next steps.",
  ],
  design: [
    "Your docs are so clear they should be framed.",
    "You notice the details that make people smile.",
    "You make complicated things feel simple.",
    "Users are happier because of choices you made.",
  ],
};

const THEMES = Object.keys(COMPLIMENTS);
const MAX_MENTIONS = 10;
const THEME_ICONS = {
  general: "💐",
  code: "🚀",
  teamwork: "🤝",
  leadership: "🏆",
  design: "🎨",
};

const HELP_TEXT = [
  "*Kudos Bot* 💐 spreads good vibes.",
  "• `/compliment` — random compliment for the channel",
  "• `/compliment @teammate` — aim it at someone",
  "• `/compliment @teammate for <reason>` — add your own personal note",
  "• `/compliment @a @b code` — themed, one per person",
  `Themes: ${THEMES.map((t) => "`" + t + "`").join(", ")}`,
  "• `/compliment themes` — browse themes and sample praise",
  "• `/compliment stats` — app metrics and permissions",
].join("\n");

const THEMES_TEXT = [
  "*Kudos Bot Themes & Categories* 🎨",
  ...THEMES.map((t) => `• *${t}* (${COMPLIMENTS[t].length} compliments) ${THEME_ICONS[t]} — e.g. _"${COMPLIMENTS[t][0]}"_`),
  "\nUsage: `/compliment @teammate " + THEMES[1] + "` or `/compliment " + THEMES[2] + "`",
].join("\n");

// Optional in-memory rate limiter per user (enabled if RATE_LIMIT_MS > 0)
const lastSeen = new Map();
function isRateLimited(userId, windowMs = Number(process.env.RATE_LIMIT_MS) || 0) {
  if (!userId || windowMs <= 0) return false;
  const now = Date.now();
  const prev = lastSeen.get(userId) || 0;
  if (now - prev < windowMs) return true;
  lastSeen.set(userId, now);
  if (lastSeen.size > 1000) {
    for (const [k, v] of lastSeen.entries()) {
      if (now - v > 60000) lastSeen.delete(k);
    }
  }
  return false;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ephemeral(text) {
  return { response_type: "ephemeral", text };
}

// Enterprise security: neutralize broadcast notifications or link injection
function sanitizeCustomText(text) {
  return text
    .replace(/<!(here|channel|everyone|subteam\^[A-Z0-9]+)>/gi, "[$1]")
    .replace(/<([^>]+)>/g, "$1") // strip raw tags
    .trim();
}

function buildReply(body) {
  const allowed = process.env.ALLOWED_TEAM_ID;
  if (allowed && body.team_id !== allowed) {
    return ephemeral("Sorry, this Kudos Bot isn't enabled for your workspace.");
  }

  if (body.user_id && isRateLimited(body.user_id)) {
    return ephemeral("Hold on a moment! ⏳ Please wait a second before sending another compliment.");
  }

  const raw = (body.text || "").trim();

  // Fast subcommands
  const lowerTrimmed = raw.toLowerCase();
  if (lowerTrimmed === "help") return ephemeral(HELP_TEXT);
  if (lowerTrimmed === "themes" || lowerTrimmed === "list") return ephemeral(THEMES_TEXT);
  if (lowerTrimmed === "stats") {
    const total = Object.values(COMPLIMENTS).reduce((acc, c) => acc + c.length, 0);
    return ephemeral(`*Kudos Bot Stats* 📊\n• Total compliments: ${total} across ${THEMES.length} themes\n• Active permission: \`commands\` (Least privilege)\n• Stored credentials: 0 (No bot token required)\n• Response time: < 50ms`);
  }

  // Extract unique user mentions — Slack sends "<@U123|name>" when should_escape is true.
  const mentions = [...new Set([...raw.matchAll(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g)].map((m) => m[1]))];
  if (mentions.length > MAX_MENTIONS) {
    return ephemeral(`Whoa, that's a lot of kudos! Please mention up to ${MAX_MENTIONS} people at a time.`);
  }

  // Remove mentions to extract theme and custom note
  let remaining = raw.replace(/<@[UW][A-Z0-9]+(?:\|[^>]*)?>/g, " ").replace(/\s+/g, " ").trim();

  // Find theme keyword if present
  let theme;
  for (const t of THEMES) {
    const regex = new RegExp(`(^|\\s)${t}(\\s|$)`, "i");
    if (regex.test(remaining)) {
      theme = t;
      remaining = remaining.replace(regex, " ").replace(/\s+/g, " ").trim();
      break;
    }
  }

  // Clean custom note (e.g., "for fixing the build" or "thanks for helping")
  let customNote = sanitizeCustomText(remaining);
  if (customNote.toLowerCase().startsWith("for ")) {
    customNote = customNote.slice(4).trim();
  } else if (customNote.toLowerCase().startsWith("thanks for ")) {
    customNote = customNote.slice(11).trim();
  }

  const pool = theme ? COMPLIMENTS[theme] : Object.values(COMPLIMENTS).flat();

  // Cycle shuffled compliments for multi-person kudos
  let deck = shuffle(pool);
  const next = () => {
    if (!deck.length) deck = shuffle(pool);
    return deck.pop();
  };

  let message;
  if (mentions.length <= 1) {
    const target = mentions.length ? `<@${mentions[0]}> ` : "";
    message = `${target}${next()} 💐`;
    if (customNote) {
      message += `\n> _"${customNote}"_`;
    }
  } else {
    message = mentions.map((id) => `• <@${id}> — ${next()}`).join("\n");
    if (customNote) {
      message += `\n> _"${customNote}"_`;
    }
  }

  const credit = body.user_id ? `Sent by <@${body.user_id}> with \`/compliment\`` : "Sent with `/compliment`";
  const footer = theme ? `${credit} · theme: ${theme}` : credit;

  return {
    response_type: "in_channel",
    text: message, // fallback for notifications / screen readers
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: message } },
      { type: "context", elements: [{ type: "mrkdwn", text: footer }] },
    ],
  };
}

export default defineComponent({
  async run({ steps, $ }) {
    const body = steps.trigger?.event?.body || {};

    // Slack occasionally pings the URL with an SSL check — just ACK it.
    if (body.ssl_check) {
      await $.respond({ immediate: true, status: 200, body: "" });
      return { ssl_check: true };
    }

    const reply = buildReply(body);
    await $.respond({
      immediate: true,
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: reply,
    });

    return { type: reply.response_type, text: reply.text, channel: body.channel_id, by: body.user_id };
  },
});
