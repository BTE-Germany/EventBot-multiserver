// The Build Battle from the event brief: Team Germany (Lübeck) vs Team Poland (Opole),
// one judge per team plus a neutral judge from another team.
const { createMemoryStore } = require("./memoryStore.js");
const { createEventService } = require("../../src/services/events.js");
const { createActionService } = require("../../src/services/actions.js");
const { createStatsService } = require("../../src/services/stats.js");
const { DEFAULT_SCORING } = require("../../src/domain/scoring.js");
const { createSettingsService, DEFAULTS } = require("../../src/config/settings.js");

const TERMS = DEFAULTS.legal.version;

const IDS = {
  guildDE: "100000000000000001",
  guildPL: "100000000000000002",
  guildNeutral: "100000000000000003",
  judgeDE: "200000000000000001",
  judgeDE2: "200000000000000002",
  judgePL: "200000000000000003",
  judgeNeutral: "200000000000000004",
  builderDE: "300000000000000001",
  builderPL: "300000000000000002",
  builderDE2: "300000000000000003",
  admin: "804386907244462141",
};

async function seedBattle({ status = "RUNNING", startsAt, endsAt, scoring = DEFAULT_SCORING } = {}) {
  const store = createMemoryStore();
  const event = await store.createEvent({
    name: "Build Battle: BTE Poland vs. BTE Germany",
    status,
    startsAt: startsAt ?? new Date("2026-12-04T15:00:00Z"),
    endsAt: endsAt ?? new Date("2026-12-11T19:00:00Z"),
    scoring,
  });
  const germany = await store.createTeam({ eventId: event.id, name: "Germany", emoji: "🇩🇪", color: "#FFCC00", location: "Lübeck" });
  const poland = await store.createTeam({ eventId: event.id, name: "Poland", emoji: "🇵🇱", color: "#DC143C", location: "Opole" });
  await store.linkGuild(event.id, IDS.guildDE, germany.id);
  await store.linkGuild(event.id, IDS.guildPL, poland.id);
  await store.linkGuild(event.id, IDS.guildNeutral, null);
  await store.addJudge({ eventId: event.id, userId: IDS.judgeDE, teamId: germany.id });
  await store.addJudge({ eventId: event.id, userId: IDS.judgeDE2, teamId: germany.id });
  await store.addJudge({ eventId: event.id, userId: IDS.judgePL, teamId: poland.id });
  await store.addJudge({ eventId: event.id, userId: IDS.judgeNeutral, teamId: null });

  const events = createEventService({ store });
  const calls = { publish: [], refresh: [], removeMessages: [], removedImages: [] };
  const panels = {
    publish: async (b) => calls.publish.push(b.id),
    refresh: async (id) => calls.refresh.push(id),
    removeMessages: async (b) => calls.removeMessages.push(b.id),
  };
  const images = {
    storeAll: async (prefix, attachments) => ({ urls: attachments.map((a) => a.url), allStored: true, storageEnabled: true }),
    removeAll: async (urls) => calls.removedImages.push(...urls),
  };
  const access = { isAdmin: async (id) => id === IDS.admin, isOwner: (id) => id === IDS.admin };
  const stats = createStatsService({ store, ttlMs: 0 });
  // Inside the building phase
  const now = () => new Date("2026-12-06T12:00:00Z");
  const settings = createSettingsService({ store });
  const actions = createActionService({ store, panels, images, stats, access, settings, now });
  const bundle = await events.bundle(event.id);
  return { store, events, actions, stats, settings, bundle, event, teams: { germany, poland }, calls, now };
}

const user = (id, name = `user-${id.slice(-2)}`) => ({ id, name });
const attachment = (n = 1) => ({ url: `https://cdn.discordapp.com/attachments/1/${n}/shot.png`, name: "shot.png", contentType: "image/png" });

module.exports = { IDS, TERMS, seedBattle, user, attachment };
