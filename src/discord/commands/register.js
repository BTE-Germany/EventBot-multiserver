const { defineCommand, TYPES } = require("../command.js");
const { respondTeams } = require("../autocomplete.js");
const { consentDialog } = require("../views/legal.js");

// Validates first, then asks the user to accept the Terms of Service.
// The participant is only created when they press "Accept & register".
module.exports = defineCommand({
  name: "register",
  options: [
    { name: "minecraft", type: TYPES.STRING, required: true, min_length: 3, max_length: 16 },
    { name: "team", type: TYPES.INTEGER, required: false, autocomplete: true },
  ],
  autocomplete: respondTeams,
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    const check = await ctx.services.actions.checkRegistration({
      bundle,
      guildId: ctx.guildId,
      user: ctx.user,
      minecraftName: ctx.interaction.options.getString("minecraft"),
      teamId: ctx.interaction.options.getInteger("team"),
    });
    await ctx.reply(
      consentDialog({
        bundle,
        t: ctx.t,
        mode: check.mode,
        name: check.name,
        team: check.team,
        teamId: check.mode === "new" ? check.team.id : null,
        termsVersion: check.termsVersion,
      })
    );
  },
});
