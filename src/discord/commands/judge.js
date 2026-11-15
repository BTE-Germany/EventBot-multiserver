const { defineCommand, TYPES } = require("../command.js");
const { respondBuilds, respondScores } = require("../autocomplete.js");
const { judgeReply } = require("../components/judging.js");

module.exports = defineCommand({
  name: "judge",
  access: "judge",
  options: [
    { name: "id", type: TYPES.INTEGER, required: true, autocomplete: true },
    { name: "base", type: TYPES.NUMBER, required: true, autocomplete: true, min_value: 0 },
    { name: "effort", type: TYPES.NUMBER, required: true, autocomplete: true, min_value: 0 },
    { name: "detail", type: TYPES.NUMBER, required: true, autocomplete: true, min_value: 0 },
  ],
  autocomplete(ctx) {
    const focused = ctx.interaction.options.getFocused(true);
    return focused.name === "id" ? respondBuilds(ctx, { statuses: ["PENDING", "IN_REVIEW"], mySlot: true }) : respondScores(ctx);
  },
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    const opts = ctx.interaction.options;
    await ctx.defer();
    const result = await ctx.services.actions.vote({
      bundle,
      buildId: opts.getInteger("id"),
      user: ctx.user,
      values: { basePoints: opts.getNumber("base"), effort: opts.getNumber("effort"), detail: opts.getNumber("detail") },
    });
    await ctx.reply(await judgeReply(ctx, bundle, result));
  },
});
