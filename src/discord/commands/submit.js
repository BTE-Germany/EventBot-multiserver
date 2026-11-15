const { defineCommand, TYPES } = require("../command.js");
const { UserError } = require("../../core/errors.js");
const { isImageAttachment } = require("../../domain/validation.js");

module.exports = defineCommand({
  name: "submit",
  options: [
    { name: "coordinates", type: TYPES.STRING, required: true, max_length: 200 },
    {
      name: "reference",
      type: TYPES.STRING,
      required: true,
      choiceKeys: ["3d", "streetview", "images", "other"].map((value) => ({ value, key: `reference.${value}` })),
    },
    { name: "link", type: TYPES.STRING, required: true, max_length: 500 },
    { name: "image1", type: TYPES.ATTACHMENT, required: true },
    { name: "image2", type: TYPES.ATTACHMENT, required: false },
    { name: "image3", type: TYPES.ATTACHMENT, required: false },
    { name: "area", type: TYPES.NUMBER, required: false, min_value: 0 },
  ],
  async execute(ctx) {
    const bundle = await ctx.requireEvent();
    const opts = ctx.interaction.options;
    const attachments = ["image1", "image2", "image3"].map((n) => opts.getAttachment(n)).filter(Boolean);
    if (!attachments.every(isImageAttachment)) throw new UserError("submit.imagesOnly");

    // Downloading and converting images can take longer than Discord's 3 seconds
    await ctx.defer();
    const { build, allStored } = await ctx.services.actions.submit({
      bundle,
      guildId: ctx.guildId,
      user: ctx.user,
      location: opts.getString("coordinates"),
      referenceType: opts.getString("reference"),
      referenceLink: opts.getString("link"),
      area: opts.getNumber("area"),
      attachments: attachments.map((a) => ({ url: a.url, name: a.name, contentType: a.contentType })),
    });
    await ctx.reply(
      `✅ ${ctx.t("submit.success", { id: build.id })}` + (allStored ? "" : `\n⚠️ ${ctx.t("submit.uploadWarning")}`)
    );
  },
});
