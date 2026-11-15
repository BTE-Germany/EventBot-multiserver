// Resolves which event a server belongs to and caches the event "bundle"
// (event + teams + servers + judges), which almost every interaction needs.
const { createCache } = require("../core/cache.js");
const { TOPICS } = require("../core/bus.js");
const { parseScoring, slotOfJudge, NEUTRAL_SLOT, slotTeamId } = require("../domain/scoring.js");

function decorate(bundle) {
  if (!bundle) return null;
  const scoring = parseScoring(bundle.event.scoring);
  const teamById = new Map(bundle.teams.map((t) => [t.id, t]));
  const judgeByUser = new Map(bundle.judges.map((j) => [String(j.userId), j]));
  return {
    ...bundle,
    scoring,
    team: (id) => (id == null ? null : teamById.get(Number(id)) || null),
    judge: (userId) => judgeByUser.get(String(userId)) || null,
    isJudge: (userId) => judgeByUser.has(String(userId)),
    guildLink: (guildId) => bundle.guilds.find((g) => String(g.guildId) === String(guildId)) || null,
    judgeSlot: (userId) => {
      const judge = judgeByUser.get(String(userId));
      return judge ? slotOfJudge(judge) : null;
    },
  };
}

// Human readable name of a judge slot, translated
function slotLabel(bundle, slot, t) {
  if (slot === NEUTRAL_SLOT) return t("slots.neutral");
  const team = bundle.team(slotTeamId(slot));
  return t("slots.team", { team: team ? teamLabel(team) : "?" });
}

const teamLabel = (team) => (team ? `${team.emoji ? `${team.emoji} ` : ""}${team.name}` : "");

function createEventService({ store, bus }) {
  const bundles = createCache({ ttlMs: 15000 });
  const guildEvents = createCache({ ttlMs: 15000 });
  bus?.subscribe(({ topic }) => {
    if (topic === TOPICS.EVENT) {
      bundles.clear();
      guildEvents.clear();
    }
  });

  const service = {
    async bundle(eventId) {
      if (!eventId) return null;
      return bundles.get(eventId, async () => decorate(await store.getEventBundle(eventId)));
    },
    async forGuild(guildId) {
      if (!guildId) return null;
      const eventId = await guildEvents.get(String(guildId), () => store.findEventIdForGuild(guildId));
      return service.bundle(eventId);
    },
    // Latest running (or otherwise latest) event, used by the public API
    async current() {
      const events = await store.listEvents();
      const pick =
        events.find((e) => e.status === "RUNNING") ||
        events.find((e) => e.status === "ENDED") ||
        events.find((e) => e.status !== "ARCHIVED") ||
        events[0];
      return pick ? service.bundle(pick.id) : null;
    },
    invalidate() {
      bundles.clear();
      guildEvents.clear();
      bus?.publish(TOPICS.EVENT, {});
    },
  };
  return service;
}

module.exports = { createEventService, decorate, slotLabel, teamLabel };
