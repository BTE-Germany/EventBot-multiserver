const { defineCommand, TYPES } = require("../command.js");
const { respondTeams } = require("../autocomplete.js");
const { leaderboardPage } = require("../views/leaderboard.js");

module.exports = defineCommand({
  name: "leaderboard",
  options: [{ name: "team", type: TYPES.INTEGER, required: false, autocomplete: true }],
  autocomplete: respondTeams,
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    const lb = await ctx.services.stats.leaderboard(bundle);
    const teamId = ctx.interaction.options.getInteger("team");
    await ctx.reply(leaderboardPage({ bundle, lb, t: ctx.t, page: 0, teamId: bundle.team(teamId) ? teamId : null }));
  },
});
