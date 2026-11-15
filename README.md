# EventBot Multiserver

A Discord bot for build battles between several communities, e.g. **BTE Poland vs. BTE Germany**. It is based on the BTE Germany EventBot and adds:

- **Multiple servers and teams.** Every team has its own Discord server. Neutral servers can join too.
- **Fair judging.** Every build is scored by one judge per team plus one neutral judge, so an event needs at least *teams + 1* judges. Base points are decided by vote; effort and details are averaged.
- **An admin dashboard** at `/admin/` for servers, channels, events, teams, judges, participants, builds, activity, legal texts and storage. Nothing besides secrets lives in `.env`.
- **Native multithreading.** Every shard runs in its own `worker_threads` thread, and a separate worker pool converts screenshots and renders the PNG cards.
- **All 32 Discord languages.** Commands, replies, panels and leaderboards are translated.
- **Visual cards.** There is a team battle card and a personal profile card, plus progress bars, galleries and buttons.
- **Personal stats.** `/profile`, `/builds` and `/leaderboard`.
- **Terms of Service and Privacy Policy.** The bot ships both, readable in Discord and on the web. They must be accepted when registering, and acceptance is recorded with a version.
- **Tests:** 106 of them (`npm test`).

## Quick start

```bash
cp .env.example .env      # set BOT_TOKEN (and PUBLIC_URL if the bot is reachable from outside)
docker compose up -d --build
```

Then type **`/dashboard`** in Discord as the owner (`OWNER_ID`, default `804386907244462141`), either on a server or in a DM with the bot. You get a single-use login link that is valid for 10 minutes. No OAuth app or client secret is needed; the signing secret is created automatically and stored in the database.

The bot needs the **Message Content** intent if plain-message submissions are enabled for a server.

## Setting up a build battle

1. **Settings:** fill in the legal details. In particular the **hosting provider** is required for the Privacy Policy. Optionally set image storage (container + CDN URL) and a stats webhook.
2. **Servers:** for every server, pick the language and the channels: submissions, judges, leaderboard and announcements. Optionally pick a judge role to ping.
3. **Events → New event:** set the name, rules, image, start and end, and scoring. The defaults are base 0–2, effort 0–6 and details 0–10 in 0.5 steps; judges cannot win.
4. **Teams:** for example 🇩🇪 Germany (Lübeck) and 🇵🇱 Poland (Opole).
5. **Servers tab:** link each team server to its team. A server without a team is neutral, and people registering there choose their team.
6. **Judges:** add Discord IDs per team plus the neutral group. The dashboard shows missing slots, and the event cannot be set to `RUNNING` until every slot is covered. It also warns about slots with only one judge, because that judge cannot score their own builds.
7. **Set the status to RUNNING.** The bot then posts the start announcement once the start time is reached. It closes the event at the end time, and the wrap-up is posted with `/wrapup post:True` or from the dashboard.

## Commands

| Everyone | Judges | Admins |
|---|---|---|
| `/register` · `/submit` · `/profile` · `/builds` · `/leaderboard` · `/stats` · `/help` · `/legal` | `/judge` · `/reject` · `/unjudged` · `/correct` · `/delete` · `/refresh` | `/dashboard` · `/wrapup` |

Judges can also use the **Score** and **Reject** buttons on every judge panel. Builders get **Add info** and, after a rejection, **Resubmit**.

## Architecture

```
src/
  main.js              main thread: command deploy, ShardingManager (worker mode), web server, scheduler
  discord/shard.js     one worker thread per shard: gateway client + interaction registry
  container.js         wires the services (once per thread)
  config/              env (secrets only), DB-backed settings + per-server config, cached and
                       invalidated across threads via BroadcastChannel (core/bus.js)
  domain/              pure rules: scoring, eligibility, leaderboard, event phases, validation
  services/            actions (register/submit/vote/reject/…), stats, panels (REST only),
                       cards, storage, events
  db/store.js          the only place that talks to Prisma
  discord/             commands, components (buttons/modals), views (pure payload builders)
  render/ + workers/   SVG cards, worker pool tasks (sharp)
  legal/               Privacy Policy & Terms (de binding, en), Discord pager + HTML
  web/                 Fastify: public API, legal pages, dashboard + admin API
  i18n/locales/        32 language files, en-US is the source
```

Panels are posted and edited through Discord's REST API, so they work from any thread. This also covers servers on other shards and the scheduler in the main thread.

## Public API (unchanged)

`GET /leaderboard` returns exactly the original shape `{ users, builds, points }` with the original field names (`A` = technique/details, `B` = effort, `base_points`, `judge_msg`, …). `test/api.test.js` locks this down. By default it shows the running event; `?event=<id>` picks a specific one. The stats webhook sends the original payload too, but is now configured in the dashboard.

## Legal

The bot's own Privacy Policy and Terms of Service live in `src/legal/documents/` in German (binding) and English. Operator details are filled in from the dashboard. Users read them with buttons in the `/register` dialog or with `/legal`; they are also served at `/legal/privacy` and `/legal/terms`.

Changing **Settings → Legal → version** makes everyone accept the terms again before their next submission. Personal data of finished events is deleted automatically after the configured retention period (default 12 months). Single participants can be erased from the dashboard for GDPR requests.

The texts were drafted carefully for German law but are **not legal advice**. Have them reviewed before going live.

## Development

```bash
npm install
npx prisma generate
npm test                 # 106 tests, no database needed (in-memory store)
npm run dev              # needs .env and a PostgreSQL database
```
