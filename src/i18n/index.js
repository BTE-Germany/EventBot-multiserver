// Translations for every locale Discord supports. en-US is the source of truth;
// missing keys fall back to it, so a partial translation never breaks a reply.
const fs = require("fs");
const path = require("path");

const DISCORD_LOCALES = [
  "id", "da", "de", "en-GB", "en-US", "es-ES", "es-419", "fr", "hr", "it", "lt",
  "hu", "nl", "no", "pl", "pt-BR", "ro", "fi", "sv-SE", "vi", "tr", "cs", "el",
  "bg", "ru", "uk", "hi", "th", "zh-CN", "ja", "zh-TW", "ko",
];
const FALLBACK = "en-US";
const LOCALE_DIR = path.join(__dirname, "locales");

function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, full, out);
    else out[full] = String(value);
  }
  return out;
}

function loadCatalogs(dir = LOCALE_DIR) {
  const catalogs = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    catalogs[file.slice(0, -5)] = flatten(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
  }
  return catalogs;
}

const catalogs = loadCatalogs();

// Maps anything Discord or a user sends ("de", "en-gb", "es-419") to a known locale
function resolveLocale(locale) {
  if (!locale) return FALLBACK;
  const exact = DISCORD_LOCALES.find((l) => l.toLowerCase() === String(locale).toLowerCase());
  if (exact && catalogs[exact]) return exact;
  const base = String(locale).split("-")[0].toLowerCase();
  // Untagged or unknown English variants go to the default, not en-GB
  if (FALLBACK.split("-")[0].toLowerCase() === base) return FALLBACK;
  const sameLanguage = DISCORD_LOCALES.find((l) => l.split("-")[0].toLowerCase() === base && catalogs[l]);
  return sameLanguage || FALLBACK;
}

function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined || vars[name] === null ? match : String(vars[name])
  );
}

function t(locale, key, vars = {}) {
  const resolved = resolveLocale(locale);
  const template = catalogs[resolved]?.[key] ?? catalogs[FALLBACK][key];
  if (template === undefined) return key;
  return interpolate(template, vars);
}

// A translator bound to one locale, plus number formatting in that locale
function translator(locale) {
  const resolved = resolveLocale(locale);
  const formatLocale = locale && Intl.NumberFormat.supportedLocalesOf(locale).length ? locale : resolved;
  const numberFormat = new Intl.NumberFormat(formatLocale, { maximumFractionDigits: 2 });
  const fn = (key, vars) => t(resolved, key, vars);
  fn.locale = resolved;
  fn.number = (n) => numberFormat.format(Number(n) || 0);
  fn.has = (key) => catalogs[resolved]?.[key] !== undefined;
  return fn;
}

// { "de": "...", "fr": "..." } for Discord's *_localizations fields
function localizations(key, vars = {}) {
  const result = {};
  for (const locale of DISCORD_LOCALES) {
    if (locale === FALLBACK || !catalogs[locale]?.[key]) continue;
    result[locale] = interpolate(catalogs[locale][key], vars);
  }
  return result;
}

const availableLocales = () => DISCORD_LOCALES.filter((l) => catalogs[l]);

module.exports = {
  DISCORD_LOCALES,
  FALLBACK,
  LOCALE_DIR,
  catalogs,
  flatten,
  loadCatalogs,
  resolveLocale,
  interpolate,
  t,
  translator,
  localizations,
  availableLocales,
};
