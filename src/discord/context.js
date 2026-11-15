// Everything a handler needs about one interaction: who, where, which event,
// translators for the user's and the server's language, and the services.
const { translator } = require("../i18n/index.js");
const { UserError } = require("../core/errors.js");

const EPHEMERAL = 64;

async function createContext(interaction, services) {
  const guildConfig = interaction.guildId ? await services.guildConfigs.get(interaction.guildId) : null;
  const settings = await services.settings.get();
  let bundlePromise;

  const user = {
    id: interaction.user.id,
    name: interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
    avatarUrl: interaction.user.displayAvatarURL?.({ extension: "png", size: 256 }) || null,
  };

  const ctx = {
    interaction,
    services,
    user,
    guildId: interaction.guildId,
    guildConfig,
    // Replies only the user sees are in their Discord language
    t: translator(interaction.locale),
    // Public messages are in the server's language
    gt: translator(guildConfig?.locale || interaction.guildLocale || settings.defaultLocale),
    event() {
      bundlePromise ??= interaction.guildId ? services.events.forGuild(interaction.guildId) : Promise.resolve(null);
      return bundlePromise;
    },
    async requireEvent() {
      if (!interaction.guildId) throw new UserError("common.guildOnly");
      const bundle = await ctx.event();
      if (!bundle) throw new UserError("common.noEvent");
      return bundle;
    },
    async requireJudge() {
      const bundle = await ctx.requireEvent();
      if (!bundle.isJudge(user.id) && !(await services.access.isAdmin(user.id))) throw new UserError("common.notJudge");
      return bundle;
    },
    async requireAdmin() {
      if (!(await services.access.isAdmin(user.id))) throw new UserError("common.notAdmin");
    },
    // Reply or follow up, whatever state the interaction is in
    async reply(payload, { ephemeral = true } = {}) {
      const body = typeof payload === "string" ? { content: payload } : payload;
      const flags = ephemeral ? EPHEMERAL : undefined;
      if (interaction.deferred && !interaction.replied) return interaction.editReply(body);
      if (interaction.replied) return interaction.followUp({ ...body, flags });
      return interaction.reply({ ...body, flags });
    },
    defer: ({ ephemeral = true } = {}) => interaction.deferReply(ephemeral ? { flags: EPHEMERAL } : {}),
    success: (text) => ctx.reply({ content: `✅ ${text}` }),
  };
  return ctx;
}

module.exports = { createContext, EPHEMERAL };
