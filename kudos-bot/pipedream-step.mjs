// Kudos Bot v2 — Pipedream "Run custom code" (Node.js) step  ✅ RECOMMENDED
//
// Slack scope needed: `commands` ONLY (no chat:write, no bot token in code).
// We answer Slack's slash-command request directly with response_type "in_channel",
// so the compliment is posted publicly in the channel where /compliment was typed.
//
// Usage in Slack:
//   /compliment                    → random compliment for the channel
//   /compliment @sam               → compliment aimed at Sam
//   /compliment @sam @lee code     → themed compliment for each person (max 10)
//   /compliment help               → private usage tips (only you see it)
// Themes: code, teamwork, leadership, design, general
//
// Optional hardening (Pipedream → Settings → Environment Variables):
//   ALLOWED_TEAM_ID = T0123ABCD  → only your workspace can use this endpoint.

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

const HELP_TEXT = [
  "*Kudos Bot* 💐 spreads good vibes.",
  "• `/compliment` — random compliment for the channel",
  "• `/compliment @teammate` — aim it at someone",
  "• `/compliment @a @b code` — themed, one per person",
  `Themes: ${THEMES.map((t) => "`" + t + "`").join(", ")}`,
].join("\n");

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

function buildReply(body) {
  const allowed = process.env.ALLOWED_TEAM_ID;
  if (allowed && body.team_id !== allowed) {
    return ephemeral("Sorry, this Kudos Bot isn't enabled for your workspace.");
  }

  const raw = (body.text || "").trim();
  const words = raw.replace(/<[^>]*>/g, " ").toLowerCase().split(/\s+/).filter(Boolean);
  if (words[0] === "help") return ephemeral(HELP_TEXT);

  // Unique user mentions — Slack sends "<@U123|name>" when should_escape is true.
  const mentions = [...new Set([...raw.matchAll(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g)].map((m) => m[1]))];
  if (mentions.length > MAX_MENTIONS) {
    return ephemeral(`Whoa, that's a lot of kudos! Please mention up to ${MAX_MENTIONS} people at a time.`);
  }

  const theme = words.find((w) => THEMES.includes(w));
  const pool = theme ? COMPLIMENTS[theme] : Object.values(COMPLIMENTS).flat();

  // Different compliment per person (cycle the shuffled pool if needed).
  let deck = shuffle(pool);
  const next = () => {
    if (!deck.length) deck = shuffle(pool);
    return deck.pop();
  };

  let message;
  if (mentions.length <= 1) {
    message = `${mentions.length ? `<@${mentions[0]}> ` : ""}${next()} 💐`;
  } else {
    message = mentions.map((id) => `• <@${id}> — ${next()}`).join("\n");
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
    const body = steps.trigger.event.body || {};

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
