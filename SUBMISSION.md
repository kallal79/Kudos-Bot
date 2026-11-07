# Handshake submission

**Project title:**
Kudos Bot – A Least-Privilege Slack Compliment App

**Repository URL:**
https://github.com/kallal79/kudos-bot

**Upload:** screenshot of the `/compliment` reply in your sandbox channel.
**Cover:** `kudos-bot/icon.png` (or a 3:2 screenshot ≥1200 px wide).
**Share to Showcase:** ✅

> Use the description that matches the track you deployed.

---

## Version A — Track A (`commands` only, recommended)

**Description (paste as-is):**
Kudos Bot posts a random compliment the whole channel sees when anyone types /compliment. Mention teammates (/compliment @sam @lee code) to give each a unique themed compliment. I granted one bot scope, commands, because the app only needs to receive its slash command; it replies via Slack's in-channel response, so it needs no chat:write, stores no token, and never reads messages. Next I'd add a weekly kudos leaderboard and team-submitted compliments.

---

## Version B — Track B (`chat:write`, course-exact)

**Description (paste as-is):**
Kudos Bot posts a random, work-friendly compliment for the whole channel when anyone types /compliment. I granted one bot scope, chat:write, because posting a message is the app's only job; I skipped chat:write.public and every read scope, and Slack adds commands automatically for the slash command. The bot token lives in a Pipedream environment variable, never in code. Next I'd add @mentions to aim compliments at teammates and a weekly kudos leaderboard.
