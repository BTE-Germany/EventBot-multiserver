const { defineCommand, TYPES } = require("../command.js");
const { respondBuilds } = require("../autocomplete.js");

module.exports = defineCommand({
  name: "delete",
  access: "judge",
  options: [
    { name: "id", type: TYPES.INTEGER, required: true, autocomplete: true },
    { name: "reason", type: TYPES.STRING, required: true, max_length: 500 },
  ],
  autocomplete: (ctx) => respondBuilds(ctx),
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    await ctx.defer();
    const id = ctx.interaction.options.getInteger("id");
    const reason = ctx.interaction.options.getString("reason");
    await ctx.services.actions.remove({ bundle, buildId: id, user: ctx.user, reason });
    await ctx.success(ctx.t("delete.done", { id, reason }));
  },
});
