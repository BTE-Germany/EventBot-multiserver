// Plain messages in a submission channel are turned into submissions,
// like the original bot did. Can be switched off per server in the dashboard.
const { translator } = require("../../i18n/index.js");
const { UserError } = require("../../core/errors.js");
const { parseMessageSubmission, isImageAttachment } = require("../../domain/validation.js");

async function hint(message, content, delay = 7000) {
  const reply = await message.reply({ content, allowedMentions: { repliedUser: true } }).catch(() => null);
  setTimeout(() => {
    reply?.delete().catch(() => {});
    message.delete().catch(() => {});
  }, delay).unref?.();
}

module.exports = {
  name: "messageCreate",
  async execute(message, services, log) {
    if (message.author.bot || !message.guildId) return;
    const config = await services.guildConfigs.get(message.guildId);
    if (!config?.messageSubmissions || String(config.submissionChannelId) !== message.channelId) return;

    const t = translator(config.locale || message.guild?.preferredLocale);
    const bundle = await services.events.forGuild(message.guildId);
    if (!bundle) return;

    const images = [...message.attachments.values()].filter(isImageAttachment);
    const parsed = parseMessageSubmission(message.content);
    if (images.length === 0 || !parsed.location) return hint(message, t("submit.messageHint"));
    if (!parsed.link) return hint(message, `❌ ${t("submit.messageNoLink")}`, 9000);

    try {
      const { allStored } = await services.actions.submit({
        bundle,
        guildId: message.guildId,
        user: { id: message.author.id, name: message.member?.displayName || message.author.username },
        location: parsed.location,
        referenceType: parsed.referenceType,
        referenceLink: parsed.link,
        area: parsed.area,
        attachments: images.map((a) => ({ url: a.url, name: a.name, contentType: a.contentType })),
      });
      // If images were not stored, the panel still points at this message's attachments
      if (allStored) await message.delete().catch(() => {});
    } catch (err) {
      if (err instanceof UserError) return hint(message, `❌ ${t(err.key, err.vars)}`);
      log.error("Message submission failed:", err);
    }
  },
};
