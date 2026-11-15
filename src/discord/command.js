// Commands declare options by name; descriptions and choice names come from
// the translation catalogs, so every Discord locale gets localized commands.
const { t, localizations, FALLBACK } = require("../i18n/index.js");

const TYPES = { STRING: 3, INTEGER: 4, BOOLEAN: 5, USER: 6, NUMBER: 10, ATTACHMENT: 11 };
const CONTEXT = { GUILD: 0, BOT_DM: 1 };

function localized(key) {
  return { description: t(FALLBACK, key), description_localizations: localizations(key) };
}

function toDiscordJSON(def) {
  const base = `commands.${def.name}`;
  return {
    name: def.name,
    ...localized(`${base}.description`),
    type: 1,
    contexts: def.contexts || [CONTEXT.GUILD],
    integration_types: [0],
    ...(def.defaultMemberPermissions !== undefined ? { default_member_permissions: def.defaultMemberPermissions } : {}),
    options: (def.options || []).map(({ choiceKeys, ...opt }) => ({
      ...opt,
      ...localized(`${base}.options.${opt.name}`),
      ...(choiceKeys
        ? {
            choices: choiceKeys.map(({ value, key }) => ({
              name: t(FALLBACK, key),
              name_localizations: localizations(key),
              value,
            })),
          }
        : {}),
    })),
  };
}

/**
 * @typedef {object} CommandDefinition
 * @property {string} name
 * @property {Array} [options]
 * @property {"everyone"|"judge"|"admin"} [access]
 * @property {number[]} [contexts]
 * @property {(ctx) => Promise<void>} execute
 * @property {(ctx) => Promise<void>} [autocomplete]
 */
function defineCommand(def) {
  return { access: "everyone", ...def, json: () => toDiscordJSON(def) };
}

module.exports = { defineCommand, toDiscordJSON, TYPES, CONTEXT };
