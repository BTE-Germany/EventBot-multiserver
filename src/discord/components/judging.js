// Judge panel buttons: score (modal) and reject (modal)
const { UserError } = require("../../core/errors.js");
const { parseScore } = require("../../domain/scoring.js");
const { translator } = require("../../i18n/index.js");
const { messageLink } = require("../views/format.js");

const input = (custom_id, label, { value, style = 1, max = 10, placeholder } = {}) => ({
  type: 1,
  components: [
    {
      type: 4,
      custom_id,
      label: label.slice(0, 45),
      style,
      required: true,
      max_length: max,
      ...(value !== undefined && value !== null ? { value: String(value) } : {}),
      ...(placeholder ? { placeholder: placeholder.slice(0, 100) } : {}),
    },
  ],
});

function jumpRow(ctx, build) {
  const m = build.messages?.find((x) => x.kind === "judge" && String(x.guildId) === String(ctx.guildId));
  if (!m) return [];
  return [{ type: 1, components: [{ type: 2, style: 5, label: ctx.t("panel.buttonJump"), url: messageLink(m.guildId, m.channelId, m.messageId) }] }];
}

async function judgeReply(ctx, bundle, result) {
  const { build } = result;
  const participant = await ctx.services.store.getParticipant(build.participantId);
  let content;
  if (result.completedNow) {
    content = `🏆 ${ctx.t("judge.completed", { id: build.id, total: ctx.t.number(build.total), builder: participant?.minecraftName ?? "?" })}`;
  } else if (result.update) {
    content = `✏️ ${ctx.t("judge.updated", { id: build.id })}`;
  } else {
    content = `✅ ${ctx.t("judge.saved", { id: build.id, done: result.done, required: result.required })}`;
  }
  return { content, components: jumpRow(ctx, build) };
}

async function rejectBuild(ctx, bundle, buildId, reason) {
  const { build } = await ctx.services.actions.reject({ bundle, buildId, user: ctx.user, reason });
  // Tell the builder in their server's language; they may have DMs disabled
  const locale = build.guildId ? await ctx.services.panels.localeOf(build.guildId) : undefined;
  const t = translator(locale);
  await ctx.services.panels.dm(build.builderId, {
    content: `❌ ${t("reject.dm", { id: build.id, event: bundle.event.name, reason })}`,
  });
  await ctx.success(ctx.t("reject.done", { id: build.id }));
}

module.exports = [
  {
    prefix: "build:score",
    access: "judge",
    async button(ctx) {
      const bundle = await ctx.requireEvent();
      const buildId = Number(ctx.args[0]);
      const build = await ctx.services.store.getBuild(buildId);
      if (!build || build.eventId !== bundle.event.id) throw new UserError("common.buildNotFound", { id: buildId });
      const own = build.votes.find((v) => String(v.judgeId) === ctx.user.id);
      const s = bundle.scoring;
      await ctx.interaction.showModal({
        custom_id: `build:score:${buildId}`,
        title: ctx.t("judge.modalTitle", { id: buildId }).slice(0, 45),
        components: [
          input("base", ctx.t("judge.modalBase", { options: s.baseOptions.join(", ") }), { value: own?.basePoints, placeholder: s.baseOptions.join(" / ") }),
          input("effort", ctx.t("judge.modalEffort", { max: s.effortMax }), { value: own?.effort, placeholder: `0 – ${s.effortMax}` }),
          input("detail", ctx.t("judge.modalDetail", { max: s.detailMax }), { value: own?.detail, placeholder: `0 – ${s.detailMax}` }),
        ],
      });
    },
    async modal(ctx) {
      const bundle = await ctx.requireEvent();
      const field = (id) => parseScore(ctx.interaction.fields.getTextInputValue(id));
      await ctx.defer();
      const result = await ctx.services.actions.vote({
        bundle,
        buildId: Number(ctx.args[0]),
        user: ctx.user,
        values: { basePoints: field("base"), effort: field("effort"), detail: field("detail") },
      });
      await ctx.reply(await judgeReply(ctx, bundle, result));
    },
  },
  {
    prefix: "build:reject",
    access: "judge",
    async button(ctx) {
      const buildId = Number(ctx.args[0]);
      await ctx.interaction.showModal({
        custom_id: `build:reject:${buildId}`,
        title: ctx.t("reject.modalTitle", { id: buildId }).slice(0, 45),
        components: [input("reason", ctx.t("reject.modalReason"), { style: 2, max: 1000 })],
      });
    },
    async modal(ctx) {
      const bundle = await ctx.requireEvent();
      await ctx.defer();
      await rejectBuild(ctx, bundle, Number(ctx.args[0]), ctx.interaction.fields.getTextInputValue("reason").trim());
    },
  },
];
module.exports.judgeReply = judgeReply;
module.exports.rejectBuild = rejectBuild;
module.exports.input = input;
