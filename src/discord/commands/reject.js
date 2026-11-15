const { defineCommand, TYPES } = require("../command.js");
const { respondBuilds } = require("../autocomplete.js");
const { rejectBuild } = require("../components/judging.js");

module.exports = defineCommand({
  name: "reject",
  access: "judge",
  options: [
    { name: "id", type: TYPES.INTEGER, required: true, autocomplete: true },
    { name: "reason", type: TYPES.STRING, required: true, max_length: 1000 },
  ],
  autocomplete: (ctx) => respondBuilds(ctx, { statuses: ["PENDING", "IN_REVIEW", "COMPLETE"] }),
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    await ctx.defer();
    await rejectBuild(ctx, bundle, ctx.interaction.options.getInteger("id"), ctx.interaction.options.getString("reason"));
  },
});
