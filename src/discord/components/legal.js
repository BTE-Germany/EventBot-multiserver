// Buttons of the Terms of Service dialog and the document reader
const { documentPage, imprintView } = require("../views/legal.js");
const { hexToInt } = require("../views/format.js");
const { teamLabel } = require("../../services/events.js");

module.exports = [
  {
    // Opens a document as a new private message, so the dialog stays usable
    prefix: "legal:doc",
    async button(ctx) {
      const [doc] = ctx.args;
      const settings = await ctx.services.settings.get();
      const payload = doc === "imprint" ? imprintView({ t: ctx.t, settings }) : documentPage({ doc, t: ctx.t, settings, env: ctx.services.env });
      await ctx.reply(payload);
    },
  },
  {
    // Paging inside an open document
    prefix: "legal:page",
    async button(ctx) {
      const [doc, page] = ctx.args;
      const settings = await ctx.services.settings.get();
      await ctx.interaction.update(documentPage({ doc, page: Number(page) || 0, t: ctx.t, settings, env: ctx.services.env }));
    },
  },
  {
    prefix: "legal:accept",
    async button(ctx) {
      const bundle = await ctx.requireEvent();
      const [version, teamId, name] = ctx.args;
      const { participant, team, updated } = await ctx.services.actions.register({
        bundle,
        guildId: ctx.guildId,
        user: ctx.user,
        minecraftName: name === "-" ? null : name,
        teamId: Number(teamId) || null,
        acceptedTermsVersion: version,
      });
      const text = updated
        ? `✅ ${ctx.t("legal.updated")}`
        : `🎉 ${ctx.t("register.success", { event: bundle.event.name, name: participant.minecraftName, team: teamLabel(team) })}`;
      await ctx.interaction.update({
        embeds: [{ description: text, color: hexToInt(team?.color), ...(bundle.event.imageUrl ? { thumbnail: { url: bundle.event.imageUrl } } : {}) }],
        components: [],
      });
    },
  },
  {
    prefix: "legal:decline",
    async button(ctx) {
      await ctx.interaction.update({ embeds: [{ description: ctx.t("legal.declined"), color: 0x6b7280 }], components: [] });
    },
  },
];
