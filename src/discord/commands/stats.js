const { defineCommand } = require("../command.js");
const { battleBoard, phaseLine } = require("../views/leaderboard.js");

module.exports = defineCommand({
  name: "stats",
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    await ctx.defer({ ephemeral: false });
    const lb = await ctx.services.stats.leaderboard(bundle);
    const subtitle = phaseLine(bundle.event, ctx.gt).replace(/<t:\d+:\w>/g, "").replace(/^\S+\s/, "").trim();
    const png = await ctx.services.cards.battle({ bundle, lb, t: ctx.gt, subtitle });
    const view = battleBoard({ bundle, lb, t: ctx.gt, imageName: png ? "battle.png" : null });
    await ctx.reply({ ...view, files: png ? [{ attachment: png, name: "battle.png" }] : [] }, { ephemeral: false });
  },
});
