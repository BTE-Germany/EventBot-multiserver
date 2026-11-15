const { defineCommand, TYPES } = require("../command.js");
const { wrapupView } = require("../views/leaderboard.js");

module.exports = defineCommand({
  name: "wrapup",
  access: "admin",
  options: [{ name: "post", type: TYPES.BOOLEAN, required: false }],
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    await ctx.defer();
    if (ctx.interaction.options.getBoolean("post")) {
      const count = await ctx.services.panels.announce(bundle.event.id, "wrapup");
      return ctx.success(ctx.t("wrapup.posted", { count }));
    }
    ctx.services.stats.invalidate(bundle.event.id);
    const lb = await ctx.services.stats.leaderboard(bundle);
    const view = wrapupView({ bundle, lb, t: ctx.t });
    await ctx.reply({ ...view, content: `👀 ${ctx.t("wrapup.preview")}` });
  },
});
