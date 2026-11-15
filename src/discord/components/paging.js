// Leaderboard and build list pages. Paging inside an ephemeral reply edits it,
// buttons on public messages open a private copy.
const { leaderboardPage } = require("../views/leaderboard.js");
const { renderBuilds } = require("../commands/builds.js");

const EPHEMERAL_FLAG = 64;
const isEphemeral = (interaction) => Boolean(Number(interaction.message?.flags?.bitfield ?? interaction.message?.flags ?? 0) & EPHEMERAL_FLAG);

async function show(ctx, payload) {
  if (isEphemeral(ctx.interaction)) return ctx.interaction.update(payload);
  return ctx.reply(payload);
}

async function eventFromArgs(ctx) {
  const bundle = await ctx.services.events.bundle(Number(ctx.args[0]));
  if (!bundle) throw new (require("../../core/errors.js").UserError)("common.noEvent");
  return bundle;
}

module.exports = [
  {
    prefix: "lb",
    async button(ctx) {
      const bundle = await eventFromArgs(ctx);
      const [, page, team] = ctx.args;
      const lb = await ctx.services.stats.leaderboard(bundle);
      await show(ctx, leaderboardPage({ bundle, lb, t: ctx.t, page: Number(page) || 0, teamId: team === "all" ? null : Number(team) }));
    },
  },
  {
    prefix: "builds",
    async button(ctx) {
      const bundle = await eventFromArgs(ctx);
      const [, userId, page] = ctx.args;
      await show(ctx, await renderBuilds(ctx, bundle, userId, Number(page) || 0));
    },
  },
];
