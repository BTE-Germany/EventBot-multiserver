const test = require("node:test");
const assert = require("node:assert/strict");
const { DOCUMENTS, getDocument, paginate, toDiscord, renderHtml, legalVars, documentLanguage } = require("../src/legal/index.js");
const { DEFAULTS } = require("../src/config/settings.js");
const { translator, DISCORD_LOCALES } = require("../src/i18n/index.js");
const { documentPage, consentDialog, imprintView } = require("../src/discord/views/legal.js");
const { decorate } = require("../src/services/events.js");
const { loadComponents } = require("../src/discord/registry.js");

const env = { PUBLIC_URL: "https://bot.example.org" };
const settings = { ...DEFAULTS, legal: { ...DEFAULTS.legal, hostingProvider: "Hetzner Online GmbH, Gunzenhausen" } };
const vars = legalVars(settings.legal, { publicUrl: env.PUBLIC_URL });

test("documents exist in German and English with all placeholders filled", () => {
  for (const doc of DOCUMENTS) {
    for (const lang of ["de", "en"]) {
      const d = getDocument(doc, lang, vars);
      assert.equal(d.lang, lang);
      assert.ok(d.title.length > 3);
      assert.doesNotMatch(d.body, /\{\w+\}/, `${doc}.${lang} has unfilled placeholders`);
      assert.match(d.body, /Michael Reimchen/);
      assert.match(d.body, /michael@mic-r\.eu/);
      assert.match(d.body, new RegExp(DEFAULTS.legal.version));
    }
  }
  assert.match(getDocument("privacy", "en", vars).body, /12 months after the event ends/);
  assert.match(getDocument("privacy", "de", vars).body, /Hetzner/);
  assert.equal(getDocument("nope", "en", vars), null);
});

test("both language versions have the same structure", () => {
  for (const doc of DOCUMENTS) {
    const count = (lang) => (getDocument(doc, lang, vars).body.match(/^## /gm) || []).length;
    assert.equal(count("de"), count("en"), doc);
  }
});

test("only German clients get the German text", () => {
  assert.equal(documentLanguage("de"), "de");
  assert.equal(documentLanguage("pl"), "en");
  assert.equal(documentLanguage(undefined), "en");
});

test("pages fit into Discord embeds and keep all content", () => {
  for (const doc of DOCUMENTS) {
    const { body } = getDocument(doc, "de", vars);
    const pages = paginate(body);
    assert.ok(pages.length >= 2);
    for (const page of pages) assert.ok(toDiscord(page).length <= 4096);
    assert.equal(pages.join("\n\n").replace(/\s+/g, ""), body.replace(/\s+/g, ""));
  }
  assert.ok(paginate("## A\n\n" + "x ".repeat(3000) + "\n\n" + "y ".repeat(3000), 3800).every((p) => p.length <= 3800));
});

test("document reader and consent dialog in every locale", () => {
  const bundle = decorate({ event: { id: 1, name: "Build Battle", status: "RUNNING", scoring: {} }, teams: [{ id: 1, name: "Germany" }], guilds: [], judges: [] });
  const known = loadComponents().map((c) => c.prefix);
  for (const locale of DISCORD_LOCALES) {
    const t = translator(locale);
    for (const doc of DOCUMENTS) {
      const pages = Math.max(...[0, 1, 2, 3, 4, 5].map((p) => p));
      for (let page = 0; page < 6; page++) {
        const view = documentPage({ doc, page, t, settings, env });
        assert.ok(view.embeds[0].description.length <= 4096);
        assert.ok(view.embeds[0].footer.text.length <= 2048);
        for (const b of (view.components[0]?.components || [])) {
          assert.ok(!b.url, "no browser links in Discord");
          assert.ok(known.some((k) => b.custom_id.startsWith(`${k}:`)), b.custom_id);
        }
      }
      void pages;
    }
    const dialog = consentDialog({ bundle, t, mode: "new", name: "Opolanin_1234567", team: bundle.teams[0], teamId: 1, termsVersion: "a".repeat(40) });
    const ids = dialog.components.flatMap((r) => r.components).map((b) => b.custom_id);
    for (const id of ids) {
      assert.ok(id.length <= 100, id);
      assert.ok(known.some((k) => id.startsWith(`${k}:`) || id === k), id);
    }
    for (const b of dialog.components.flatMap((r) => r.components)) assert.ok(b.label.length <= 80);
    assert.ok(dialog.embeds[0].description.includes(t("legal.confirm")));
  }
  const imprint = imprintView({ t: translator("de"), settings });
  assert.match(imprint.embeds[0].description, /91074 Herzogenaurach/);
  assert.deepEqual(imprint.components, []);
});

test("web version escapes and links", () => {
  const html = renderHtml({ title: "<x>", body: "## A & B\n\n- **one**\n- two https://example.org\n\nText `/legal`", lang: "en" });
  assert.match(html, /<title>&lt;x&gt;<\/title>/);
  assert.match(html, /<h2>A &amp; B<\/h2>/);
  assert.match(html, /<li><strong>one<\/strong><\/li>/);
  assert.match(html, /<a href="https:\/\/example.org">/);
  assert.match(html, /<code>\/legal<\/code>/);
});
