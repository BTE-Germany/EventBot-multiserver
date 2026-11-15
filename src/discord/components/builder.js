// Builder buttons on the public panel: add notes for the judges, resubmit after a rejection
const { UserError } = require("../../core/errors.js");

function textInput(custom_id, label, { value, style = 1, max = 200, required = true, placeholder } = {}) {
  return {
    type: 1,
    components: [
      {
        type: 4,
        custom_id,
        label: label.slice(0, 45),
        style,
        required,
        max_length: max,
        ...(value ? { value: String(value).slice(0, max) } : {}),
        ...(placeholder ? { placeholder: placeholder.slice(0, 100) } : {}),
      },
    ],
  };
}

async function ownBuild(ctx) {
  const bundle = await ctx.requireEvent();
  const buildId = Number(ctx.args[0]);
  const build = await ctx.services.store.getBuild(buildId);
  if (!build || build.eventId !== bundle.event.id) throw new UserError("common.buildNotFound", { id: buildId });
  if (String(build.builderId) !== ctx.user.id) throw new UserError("common.notOwner");
  return { bundle, build };
}

module.exports = [
  {
    prefix: "build:info",
    async button(ctx) {
      const { build } = await ownBuild(ctx);
      await ctx.interaction.showModal({
        custom_id: `build:info:${build.id}`,
        title: ctx.t("info.modalTitle").slice(0, 45),
        components: [
          textInput("info", ctx.t("info.label"), { value: build.extraInfo, style: 2, max: 1000, placeholder: ctx.t("info.placeholder") }),
        ],
      });
    },
    async modal(ctx) {
      const { bundle, build } = await ownBuild(ctx);
      await ctx.services.actions.setInfo({ bundle, buildId: build.id, user: ctx.user, text: ctx.interaction.fields.getTextInputValue("info") });
      await ctx.success(ctx.t("info.saved"));
    },
  },
  {
    prefix: "build:resubmit",
    async button(ctx) {
      const { build } = await ownBuild(ctx);
      if (build.status !== "REJECTED") throw new UserError("resubmit.notRejected");
      await ctx.interaction.showModal({
        custom_id: `build:resubmit:${build.id}`,
        title: ctx.t("resubmit.modalTitle", { id: build.id }).slice(0, 45),
        components: [
          textInput("coordinates", ctx.t("resubmit.coordinates"), { value: build.location }),
          textInput("link", ctx.t("resubmit.link"), { value: build.referenceLink, max: 500 }),
          textInput("notes", ctx.t("resubmit.notes"), { style: 2, max: 500, required: false }),
        ],
      });
    },
    async modal(ctx) {
      const { bundle, build } = await ownBuild(ctx);
      const field = (id) => ctx.interaction.fields.getTextInputValue(id)?.trim() || null;
      await ctx.defer();
      await ctx.services.actions.resubmit({
        bundle,
        buildId: build.id,
        user: ctx.user,
        location: field("coordinates"),
        referenceLink: field("link"),
        note: field("notes"),
      });
      await ctx.success(ctx.t("resubmit.done", { id: build.id }));
    },
  },
];
