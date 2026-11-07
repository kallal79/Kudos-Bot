// Kudos Bot — ALTERNATIVE step that follows the course guide exactly
// (bot token + chat.postMessage). Use this only if your grader insists on chat:write.
//
// Slack scopes: chat:write (+ commands, which Slack adds automatically for the slash command).
// Hardened vs. the guide:
//   • Token read from a Pipedream environment variable (Settings → Environment
//     Variables → SLACK_BOT_TOKEN) instead of being pasted into code.
//   • Checks Slack's response; if the bot isn't in the channel, tells the user
//     privately how to fix it instead of failing silently.
//
// NOTE: chat:write only posts to channels the bot is a member of. Run
//   /invite @Kudos Bot   in the channel first.

export default defineComponent({
  async run({ steps, $ }) {
    const body = steps.trigger.event.body || {};

    // ACK within Slack's 3-second limit.
    await $.respond({ immediate: true, status: 200, body: "" });
    if (body.ssl_check) return;

    const compliments = [
      "You're the person people actually want on their team.",
      "That thing you shipped last week? Still impressive.",
      "You make hard problems look easier than they are.",
      "Your code reviews make everyone better.",
      "You turn chaos into a checklist.",
    ];
    const message = compliments[Math.floor(Math.random() * compliments.length)];

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({ channel: body.channel_id, text: message }),
    });
    const data = await res.json();

    if (!data.ok && body.response_url) {
      // Private (ephemeral) hint to the person who ran the command.
      await fetch(body.response_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_type: "ephemeral",
          text:
            data.error === "not_in_channel"
              ? "I'm not in this channel yet — type `/invite @Kudos Bot` and try again."
              : `Couldn't post: ${data.error}`,
        }),
      });
    }
    return data;
  },
});

