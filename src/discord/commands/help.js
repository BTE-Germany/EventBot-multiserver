const { defineCommand } = require("../command.js");
const { helpView } = require("../views/leaderboard.js");

module.exports = defineCommand({
  name: "help",
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    await ctx.reply(helpView({ bundle, t: ctx.t }));
  },
});
