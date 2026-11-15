const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const i18n = require("../src/i18n/index.js");

const source = i18n.catalogs[i18n.FALLBACK];
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// Discord limits that translations must respect
const LIMITS = [
  [/^commands\..*\.description$/, 100],
  [/^commands\..*\.options\./, 100],
  [/\.modal(Title|Base|Effort|Detail|Reason)$|^resubmit\.(coordinates|link|notes)$|^info\.(modalTitle|label)$/, 45],
  [/^panel\.button|^profile\.buttonBuilds$|^common\.(next|previous)$/, 80],
  [/^(categories|reference|status)\./, 100],
];
// Longest realistic values for the placeholders, used for the length checks
const SAMPLE = { id: "999999", options: "0, 1, 2", max: "10" };

test("every Discord locale has a catalog", () => {
  for (const locale of i18n.DISCORD_LOCALES) {
    assert.ok(i18n.catalogs[locale], `missing src/i18n/locales/${locale}.json`);
  }
});

for (const locale of i18n.DISCORD_LOCALES.filter((l) => i18n.catalogs[l])) {
  test(`locale ${locale} is complete and well-formed`, () => {
    const catalog = i18n.catalogs[locale];
    const missing = Object.keys(source).filter((k) => catalog[k] === undefined);
    assert.deepEqual(missing, [], `${locale} is missing keys`);
    const extra = Object.keys(catalog).filter((k) => source[k] === undefined);
    assert.deepEqual(extra, [], `${locale} has unknown keys`);

    for (const [key, value] of Object.entries(catalog)) {
      assert.ok(value.trim().length > 0, `${locale}:${key} is empty`);
      assert.deepEqual(placeholders(value), placeholders(source[key]), `${locale}:${key} placeholders differ`);
      const markers = (s) => (s.match(/`/g) || []).length % 2;
      assert.equal(markers(value), 0, `${locale}:${key} has unbalanced backticks`);
      for (const [pattern, max] of LIMITS) {
        if (!pattern.test(key)) continue;
        const rendered = i18n.interpolate(value, SAMPLE);
        assert.ok(rendered.length <= max, `${locale}:${key} is ${rendered.length} > ${max} chars: "${rendered}"`);
      }
    }
    // Slash command syntax must stay in English, it is what users type
    for (const [key, value] of Object.entries(source)) {
      for (const cmd of value.match(/`\/[a-z]+/g) || []) {
        assert.ok(catalog[key].includes(cmd), `${locale}:${key} must keep ${cmd}`);
      }
    }
  });
}

test("files are valid JSON with the source's structure", () => {
  for (const file of fs.readdirSync(i18n.LOCALE_DIR)) {
    const raw = fs.readFileSync(path.join(i18n.LOCALE_DIR, file), "utf8");
    assert.doesNotThrow(() => JSON.parse(raw), file);
  }
});

test("t() interpolates and falls back", () => {
  assert.equal(i18n.t("en-US", "common.buildNotFound", { id: 5 }), "Build #5 was not found.");
  assert.equal(i18n.t("xx-YY", "common.buildNotFound", { id: 5 }), "Build #5 was not found.");
  assert.equal(i18n.t("en-US", "does.not.exist"), "does.not.exist");
  assert.equal(i18n.t("en-US", "common.buildNotFound"), "Build #{id} was not found.");
});

test("resolveLocale maps variants", () => {
  assert.equal(i18n.resolveLocale("de"), "de");
  assert.equal(i18n.resolveLocale("DE"), "de");
  assert.equal(i18n.resolveLocale(undefined), "en-US");
  assert.equal(i18n.resolveLocale("en"), "en-US");
});

test("translator formats numbers per locale", () => {
  assert.equal(i18n.translator("de").number(4.5), "4,5");
  assert.equal(i18n.translator("en-US").number(1234.5), "1,234.5");
});
