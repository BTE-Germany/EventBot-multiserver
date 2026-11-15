// Command definitions, localizations and views against Discord's limits, in every locale
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCommands, loadComponents } = require("../src/discord/registry.js");
const { DISCORD_LOCALES, translator } = require("../src/i18n/index.js");
const { buildPanel } = require("../src/discord/views/buildPanel.js");
const views = require("../src/discord/views/leaderboard.js");
const { decorate } = require("../src/services/events.js");
const { buildLeaderboard } = require("../src/domain/leaderboard.js");
const { DEFAULT_SCORING } = require("../src/domain/scoring.js");

const NAME = /^[-_\p{L}\p{N}]{1,32}$/u;

test("commands are valid Discord application commands", () => {
  const commands = loadCommands().map((c) => c.json());
  const names = new Set();
  for (const cmd of commands) {
    assert.match(cmd.name, NAME);
    assert.equal(cmd.name, cmd.name.toLowerCase());
    assert.ok(!names.has(cmd.name), `duplicate ${cmd.name}`);
    names.add(cmd.name);
    assert.ok(cmd.description.length >= 1 && cmd.description.length <= 100);
    let seenOptional = false;
    for (const opt of cmd.options) {
      assert.match(opt.name, NAME);
      assert.ok(opt.description.length <= 100, `${cmd.name}.${opt.name}`);
      if (!opt.required) seenOptional = true;
      else assert.ok(!seenOptional, `${cmd.name}: required option ${opt.name} after optional ones`);
      assert.ok(!(opt.choices && opt.autocomplete));
      for (const [locale, text] of Object.entries(opt.description_localizations)) {
        assert.ok(DISCORD_LOCALES.includes(locale));
        assert.ok(text.length >= 1 && text.length <= 100, `${locale} ${cmd.name}.${opt.name}`);
      }
      for (const choice of opt.choices || []) {
        for (const text of Object.values(choice.name_localizations)) assert.ok(text.length <= 100);
      }
    }
    // Every Discord locale other than en-US is localized
    assert.equal(Object.keys(cmd.description_localizations).length, DISCORD_LOCALES.length - 1, cmd.name);
    assert.ok(JSON.stringify(cmd).length < 40000);
  }
  for (const expected of ["register", "submit", "judge", "reject", "profile", "leaderboard", "stats", "dashboard", "wrapup"]) {
    assert.ok(names.has(expected), expected);
  }
});

const bundle = decorate({
  event: { id: 7, name: "Build Battle: BTE Poland vs. BTE Germany", status: "RUNNING", startsAt: "2026-12-04T15:00:00Z", endsAt: "2026-12-11T19:00:00Z", scoring: {}, imageUrl: null },
  teams: [
    { id: 1, name: "Germany", emoji: "🇩🇪", color: "#FFCC00", location: "Lübeck" },
    { id: 2, name: "Poland", emoji: "🇵🇱", color: "#DC143C", location: "Opole" },
  ],
  guilds: [],
  judges: [{ userId: "500", teamId: 1 }, { userId: "501", teamId: 2 }, { userId: "502", teamId: null }],
});
const build = {
  id: 999999,
  eventId: 7,
  teamId: 1,
  builderId: "123456789012345678",
  location: "53.8655, 10.6866",
  referenceType: "streetview",
  referenceLink: "https://maps.google.com/x",
  area: 180,
  images: ["https://a/1.webp", "https://a/2.webp", "https://a/3.webp"],
  extraInfo: "Half-timbered",
  status: "IN_REVIEW",
  basePoints: 2,
  effort: 4.5,
  detail: 7,
  total: 13.5,
  override: { reason: "typo", by: "500" },
  createdAt: new Date("2026-12-05T10:00:00Z"),
  votes: [{ slot: "team:1", judgeId: "500", basePoints: 2, effort: 4.5, detail: 7 }],
};

const knownIds = loadComponents().map((c) => c.prefix);
function checkMessage(payload, label) {
  assert.ok(payload.embeds.length <= 10, label);
  let total = 0;
  for (const e of payload.embeds) {
    assert.ok((e.title || "").length <= 256, `${label} title`);
    assert.ok((e.description || "").length <= 4096, `${label} description`);
    assert.ok((e.fields || []).length <= 25, `${label} fields`);
    for (const f of e.fields || []) {
      assert.ok(f.name.length >= 1 && f.name.length <= 256, `${label} field name "${f.name}"`);
      assert.ok(f.value.length >= 1 && f.value.length <= 1024, `${label} field value`);
      total += f.name.length + f.value.length;
    }
    total += (e.title || "").length + (e.description || "").length + (e.footer?.text || "").length;
  }
  assert.ok(total <= 6000, `${label} total ${total}`);
  for (const row of payload.components || []) {
    assert.ok(row.components.length <= 5);
    for (const c of row.components) {
      if (c.label) assert.ok(c.label.length <= 80, `${label} button ${c.label}`);
      if (c.custom_id) {
        assert.ok(c.custom_id.length <= 100);
        assert.ok(knownIds.some((p) => c.custom_id.startsWith(`${p}:`)), `no handler for ${c.custom_id}`);
      }
    }
  }
}

test("all views stay within Discord limits in every locale", () => {
  const participants = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, userId: String(1000 + i), minecraftName: `Builder_${i}_long_nm`.slice(0, 16), teamId: (i % 2) + 1 }));
  const builds = participants.map((p) => ({ participantId: p.id, status: "COMPLETE", total: 10 + p.id, area: 50 }));
  const lb = buildLeaderboard({ participants, builds, teams: bundle.teams, scoring: DEFAULT_SCORING });
  for (const locale of DISCORD_LOCALES) {
    const t = translator(locale);
    for (const view of ["public", "judge"]) {
      checkMessage(buildPanel({ bundle, build, participant: { minecraftName: "Builder" }, t, view }), `${locale} panel ${view}`);
      checkMessage(buildPanel({ bundle, build: { ...build, status: "REJECTED", rejectReason: "x".repeat(1000) }, participant: null, t, view }), `${locale} rejected ${view}`);
    }
    checkMessage(views.leaderboardPage({ bundle, lb, t, page: 1 }), `${locale} leaderboard`);
    checkMessage(views.leaderboardPage({ bundle, lb, t, teamId: 2 }), `${locale} team leaderboard`);
    checkMessage(views.battleBoard({ bundle, lb, t, imageName: "battle.png" }), `${locale} board`);
    checkMessage(views.wrapupView({ bundle, lb, t }), `${locale} wrapup`);
    checkMessage(views.helpView({ bundle, t }), `${locale} help`);
    checkMessage(views.announcementView({ bundle, kind: "start", t }), `${locale} announce`);
    const participant = { userId: "1000", minecraftName: "Builder_0", teamId: 1 };
    checkMessage(
      views.profileView({ bundle, participant, player: { ...lb.players[0], rank: 3, of: 30 }, averages: { effort: 4, detail: 7 }, best: { id: 5, total: 13, location: "x" }, allTime: { events: 2, points: 50 }, t }),
      `${locale} profile`
    );
    checkMessage(views.buildsView({ bundle, participant, builds: Array.from({ length: 12 }, (_, i) => ({ ...build, id: i + 1 })), t, page: 0, links: { 1: "https://discord.com/channels/1/2/3" } }), `${locale} builds`);
  }
});

test("the judge view shows votes and notes, the public view does not", () => {
  const t = translator("en-US");
  const judge = JSON.stringify(buildPanel({ bundle, build, participant: { minecraftName: "B" }, t, view: "judge" }));
  const pub = JSON.stringify(buildPanel({ bundle, build, participant: { minecraftName: "B" }, t, view: "public" }));
  assert.ok(judge.includes("<@500>"));
  assert.ok(judge.includes("Half-timbered"));
  assert.ok(!pub.includes("<@500>"));
  assert.ok(!pub.includes("Half-timbered"));
  assert.ok(!pub.includes("Total:"), "intermediate scores stay hidden from the public");
  // Gallery: up to 4 images as embeds sharing a url
  const panel = buildPanel({ bundle, build, participant: null, t, view: "public" });
  assert.equal(panel.embeds.length, 3);
  assert.ok(panel.embeds.every((e) => e.url === panel.embeds[0].url));
});

test("the wrap-up follows the announcement template", () => {
  const participants = [
    { id: 1, userId: "1", minecraftName: "Anna", teamId: 1 },
    { id: 2, userId: "2", minecraftName: "Bartek", teamId: 2 },
  ];
  const builds = [
    { participantId: 1, status: "COMPLETE", total: 15, area: 120 },
    { participantId: 2, status: "COMPLETE", total: 12, area: 80 },
  ];
  const lb = buildLeaderboard({ participants, builds, teams: bundle.teams, scoring: DEFAULT_SCORING });
  const text = JSON.stringify(views.wrapupView({ bundle, lb, t: translator("en-US") }));
  assert.match(text, /Total area: \*\*200 m²\*\*/);
  assert.match(text, /120 m² in Lübeck/);
  assert.match(text, /80 m² in Opole/);
  assert.match(text, /\*\*2\*\* builds in total/);
  assert.match(text, /With \*\*15\*\* points, \*\*🇩🇪 Germany\*\* won!/);
  assert.match(text, /Top builders · Overall/);
  assert.match(text, /🇵🇱 `Bartek`/);
});
