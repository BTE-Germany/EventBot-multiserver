// Leaderboards and personal statistics, computed from the database
const { buildLeaderboard, findPlayer } = require("../domain/leaderboard.js");
const { createCache } = require("../core/cache.js");
const { round2 } = require("../domain/scoring.js");

function createStatsService({ store, ttlMs = 10000 }) {
  const cache = createCache({ ttlMs });

  async function leaderboard(bundle) {
    return cache.get(`lb:${bundle.event.id}`, async () => {
      const [participants, builds] = await Promise.all([
        store.listParticipants(bundle.event.id),
        store.listBuildSummaries(bundle.event.id),
      ]);
      return buildLeaderboard({
        participants,
        builds,
        teams: bundle.teams,
        judgeUserIds: bundle.judges.map((j) => String(j.userId)),
        scoring: bundle.scoring,
      });
    });
  }

  async function profile(bundle, userId) {
    const participant = await store.findParticipant(bundle.event.id, userId);
    if (!participant) return null;
    const [lb, builds, participations] = await Promise.all([
      leaderboard(bundle),
      store.listBuilds(bundle.event.id, { participantId: participant.id }),
      store.participationsOfUser(userId),
    ]);
    const complete = builds.filter((b) => b.status === "COMPLETE");
    const avg = (key) => (complete.length ? round2(complete.reduce((s, b) => s + b[key], 0) / complete.length) : 0);
    const best = complete.reduce((top, b) => (!top || b.total > top.total ? b : top), null);
    return {
      participant,
      player: findPlayer(lb, userId),
      builds,
      averages: complete.length ? { basePoints: avg("basePoints"), effort: avg("effort"), detail: avg("detail") } : null,
      best,
      allTime: {
        events: participations.length,
        points: round2(participations.reduce((s, p) => s + p.points, 0)),
        builds: participations.reduce((s, p) => s + (p._count?.builds ?? 0), 0),
      },
    };
  }

  return {
    leaderboard,
    profile,
    invalidate: (eventId) => (eventId ? cache.delete(`lb:${eventId}`) : cache.clear()),
  };
}

module.exports = { createStatsService };
