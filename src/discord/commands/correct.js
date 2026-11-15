const { defineCommand, TYPES } = require("../command.js");
const { respondBuilds, respondScores } = require("../autocomplete.js");

module.exports = defineCommand({
  name: "correct",
  access: "judge",
  options: [
    { name: "id", type: TYPES.INTEGER, required: true, autocomplete: true },
    { name: "reason", type: TYPES.STRING, required: true, max_length: 500 },
    { name: "base", type: TYPES.NUMBER, required: false, autocomplete: true, min_value: 0 },
    { name: "effort", type: TYPES.NUMBER, required: false, autocomplete: true, min_value: 0 },
    { name: "detail", type: TYPES.NUMBER, required: false, autocomplete: true, min_value: 0 },
  ],
  autocomplete(ctx) {
    const focused = ctx.interaction.options.getFocused(true);
    return focused.name === "id" ? respondBuilds(ctx, { statuses: ["IN_REVIEW", "COMPLETE"] }) : respondScores(ctx);
  },
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    const opts = ctx.interaction.options;
    await ctx.defer();
    const id = opts.getInteger("id");
    const result = await ctx.services.actions.correct({
      bundle,
      buildId: id,
      user: ctx.user,
      reason: opts.getString("reason"),
      values: { basePoints: opts.getNumber("base"), effort: opts.getNumber("effort"), detail: opts.getNumber("detail") },
    });
    await ctx.success(ctx.t("correct.done", { id, old: ctx.t.number(result.oldTotal), new: ctx.t.number(result.evaluation.total) }));
  },
});
