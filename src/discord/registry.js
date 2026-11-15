// Loads command and component modules and routes interactions to them
const fs = require("fs");
const path = require("path");
const { createContext } = require("./context.js");
const { UserError } = require("../core/errors.js");
const { translator } = require("../i18n/index.js");

function loadDir(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .sort()
    .map((f) => require(path.join(dir, f)));
}

const loadCommands = () => loadDir(path.join(__dirname, "commands"));
// Components: { prefix: "build:score", button?, modal? }
const loadComponents = () => loadDir(path.join(__dirname, "components")).flat();

function createRegistry({ services, log, commands = loadCommands(), components = loadComponents() }) {
  const commandMap = new Map(commands.map((c) => [c.name, c]));

  // "build:score:12" matches the handler with the longest prefix
  const findComponent = (customId, kind) =>
    components
      .filter((c) => c[kind] && (customId === c.prefix || customId.startsWith(`${c.prefix}:`)))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  async function reportError(interaction, err) {
    if (interaction.isAutocomplete()) return;
    const t = translator(interaction.locale);
    const content = err instanceof UserError ? `❌ ${t(err.key, err.vars)}` : `⚠️ ${t("common.error")}`;
    if (!(err instanceof UserError)) log.error(`Interaction ${interaction.commandName || interaction.customId} failed:`, err);
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content, flags: 64 });
      else await interaction.reply({ content, flags: 64 });
    } catch (replyErr) {
      log.warn("Error reply could not be sent:", replyErr.message);
    }
  }

  async function dispatch(interaction) {
    let handler;
    let run;
    if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
      handler = commandMap.get(interaction.commandName);
      run = interaction.isAutocomplete() ? handler?.autocomplete : handler?.execute;
    } else if (interaction.isButton()) {
      handler = findComponent(interaction.customId, "button");
      run = handler?.button;
    } else if (interaction.isModalSubmit()) {
      handler = findComponent(interaction.customId, "modal");
      run = handler?.modal;
    }
    if (!run) return;

    try {
      const ctx = await createContext(interaction, services);
      if (handler.access === "admin" && !interaction.isAutocomplete()) await ctx.requireAdmin();
      if (handler.access === "judge" && !interaction.isAutocomplete()) await ctx.requireJudge();
      // Component ids carry their arguments after the prefix
      ctx.args = interaction.customId ? interaction.customId.slice(handler.prefix.length + 1).split(":") : [];
      await run(ctx);
    } catch (err) {
      if (interaction.isAutocomplete()) {
        await interaction.respond([]).catch(() => {});
        if (!(err instanceof UserError)) log.warn("Autocomplete failed:", err.message);
        return;
      }
      await reportError(interaction, err);
    }
  }

  return { commands, components, dispatch, commandJSON: () => commands.map((c) => c.json()) };
}

module.exports = { createRegistry, loadCommands, loadComponents };
