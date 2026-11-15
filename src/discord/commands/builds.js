const { defineCommand, TYPES } = require("../command.js");
const { UserError } = require("../../core/errors.js");
const { buildsView } = require("../views/leaderboard.js");
const { messageLink } = require("../views/format.js");

// Shared with the "Show builds" button and paging
async function renderBuilds(ctx, bundle, userId, page = 0) {
  const participant = await ctx.services.store.findParticipant(bundle.event.id, userId);
  if (!participant) {
    throw userId === ctx.user.id ? new UserError("common.notRegistered") : new UserError("profile.notRegistered", { user: `<@${userId}>` });
  }
  const builds = await ctx.services.store.listBuilds(bundle.event.id, { participantId: participant.id });
  const links = {};
  for (const b of builds) {
    const m = b.messages.find((x) => x.kind === "public") || b.messages[0];
    if (m) links[b.id] = messageLink(m.guildId, m.channelId, m.messageId);
  }
  return buildsView({ bundle, participant, builds, t: ctx.t, page, links });
}

module.exports = defineCommand({
  name: "builds",
  options: [{ name: "user", type: TYPES.USER, required: false }],
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    const target = ctx.interaction.options.getUser("user") || ctx.interaction.user;
    await ctx.reply(await renderBuilds(ctx, bundle, target.id));
  },
});
module.exports.renderBuilds = renderBuilds;
