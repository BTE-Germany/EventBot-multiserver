const { defineCommand, CONTEXT } = require("../command.js");
const { createLoginToken } = require("../../web/auth.js");

module.exports = defineCommand({
  name: "dashboard",
  access: "admin",
  // Also usable in DMs with the bot
  contexts: [CONTEXT.GUILD, CONTEXT.BOT_DM],
  async execute(ctx) {
    const secret = await ctx.services.settings.sessionSecret();
    const token = createLoginToken(secret, ctx.user.id);
    const url = `${ctx.services.env.PUBLIC_URL}/auth/login?token=${encodeURIComponent(token)}`;
    await ctx.reply({
      content: `🔐 ${ctx.t("dashboard.link", { url })}`,
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Dashboard", emoji: { name: "🛠️" }, url }] }],
    });
  },
});
