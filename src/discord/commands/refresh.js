const { defineCommand, TYPES } = require("../command.js");
const { respondBuilds } = require("../autocomplete.js");

module.exports = defineCommand({
  name: "refresh",
  access: "judge",
  options: [{ name: "id", type: TYPES.INTEGER, required: false, autocomplete: true }],
  autocomplete: (ctx) => respondBuilds(ctx),
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    await ctx.defer();
    const id = ctx.interaction.options.getInteger("id");
    const ids = id ? [id] : (await ctx.services.store.listBuilds(bundle.event.id, { take: 10 })).map((b) => b.id);
    let count = 0;
    for (const buildId of ids) {
      const { build } = await ctx.services.actions.settle(bundle, buildId).catch(() => ({}));
      if (!build) continue;
      const { updated } = await ctx.services.panels.refresh(buildId);
      count += updated;
    }
    await ctx.services.panels.updateBoards(bundle.event.id);
    await ctx.success(ctx.t("refresh.done", { count }));
  },
});
