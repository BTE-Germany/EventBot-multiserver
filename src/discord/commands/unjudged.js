const { defineCommand } = require("../command.js");
const { slotLabel } = require("../../services/events.js");
const { messageLink, statusLabel } = require("../views/format.js");

const MAX_LINES = 25;

module.exports = defineCommand({
  name: "unjudged",
  access: "judge",
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    const slot = bundle.judgeSlot(ctx.user.id);
    const builds = (
      await ctx.services.store.listBuilds(bundle.event.id, { status: ["PENDING", "IN_REVIEW"], orderBy: "asc" })
    ).filter((b) => (!slot || !b.votes.some((v) => v.slot === slot)) && String(b.builderId) !== ctx.user.id);
    if (builds.length === 0) return ctx.reply(ctx.t("unjudged.none"));

    const lines = builds.slice(0, MAX_LINES).map((b) => {
      const m = b.messages.find((x) => x.kind === "judge" && String(x.guildId) === ctx.guildId) || b.messages[0];
      const id = m ? `[**#${b.id}**](${messageLink(m.guildId, m.channelId, m.messageId)})` : `**#${b.id}**`;
      return `${id} · ${statusLabel(b.status, ctx.t)} · ${b.votes.length} 🗳️`;
    });
    if (builds.length > MAX_LINES) lines.push(ctx.t("unjudged.more", { count: builds.length - MAX_LINES }));
    await ctx.reply({
      embeds: [
        {
          title: `⚖️ ${ctx.t("unjudged.title", { slot: slot ? slotLabel(bundle, slot, ctx.t) : "—", count: builds.length })}`,
          description: lines.join("\n"),
          color: 0x3b82f6,
        },
      ],
    });
  },
});
