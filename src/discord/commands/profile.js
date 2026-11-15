const { defineCommand, TYPES } = require("../command.js");
const { UserError } = require("../../core/errors.js");
const { profileView } = require("../views/leaderboard.js");

module.exports = defineCommand({
  name: "profile",
  options: [{ name: "user", type: TYPES.USER, required: false }],
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    const target = ctx.interaction.options.getUser("user") || ctx.interaction.user;
    const isSelf = target.id === ctx.user.id;
    const data = await ctx.services.stats.profile(bundle, target.id);
    if (!data) {
      throw isSelf ? new UserError("common.notRegistered") : new UserError("profile.notRegistered", { user: `<@${target.id}>` });
    }
    // Rendering the card goes through the worker pool
    await ctx.defer({ ephemeral: false });
    const user = { avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }) };
    const png = await ctx.services.cards.profile({ bundle, data, user, t: ctx.gt });
    const view = profileView({ bundle, ...data, t: ctx.gt, user, imageName: png ? "profile.png" : null });
    await ctx.reply({ ...view, files: png ? [{ attachment: png, name: "profile.png" }] : [] }, { ephemeral: false });
  },
});
