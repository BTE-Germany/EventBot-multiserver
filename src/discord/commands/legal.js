const { defineCommand, CONTEXT } = require("../command.js");
const { legalOverview } = require("../views/legal.js");

module.exports = defineCommand({
  name: "legal",
  contexts: [CONTEXT.GUILD, CONTEXT.BOT_DM],
  async execute(ctx) {
    await ctx.reply(legalOverview({ t: ctx.t }));
  },
});
