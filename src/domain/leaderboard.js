// Pure aggregation of participants, builds and teams into rankings
const { round2 } = require("./scoring.js");

function competitionRank(items, score) {
  let lastScore = null;
  let lastRank = 0;
  return items.map((item, i) => {
    const s = score(item);
    if (s !== lastScore) {
      lastRank = i + 1;
      lastScore = s;
    }
    return { ...item, rank: lastRank };
  });
}

/**
 * @param {object} input
 * @param {Array<{id,userId,minecraftName,teamId,banned}>} input.participants
 * @param {Array<{participantId,teamId,status,total,area}>} input.builds
 * @param {Array<{id,name,emoji,color}>} input.teams
 * @param {Set<string>|string[]} input.judgeUserIds
 * @param {object} input.scoring
 */
function buildLeaderboard({ participants, builds, teams, judgeUserIds = [], scoring }) {
  const judges = new Set([...judgeUserIds].map(String));
  const judgesCanWin = scoring?.judgesCanWin ?? false;
  const judgeBuildsCount = scoring?.judgeBuildsCountForTeam ?? true;

  const byParticipant = new Map();
  for (const b of builds) {
    const list = byParticipant.get(b.participantId) || [];
    list.push(b);
    byParticipant.set(b.participantId, list);
  }

  const players = participants
    .filter((p) => !p.banned)
    .map((p) => {
      const own = byParticipant.get(p.id) || [];
      const complete = own.filter((b) => b.status === "COMPLETE");
      const isJudge = judges.has(String(p.userId));
      return {
        participantId: p.id,
        userId: String(p.userId),
        minecraftName: p.minecraftName,
        teamId: p.teamId ?? null,
        isJudge,
        eligible: judgesCanWin || !isJudge,
        points: round2(complete.reduce((s, b) => s + (b.total || 0), 0)),
        builds: complete.length,
        submitted: own.length,
        pending: own.filter((b) => b.status === "PENDING" || b.status === "IN_REVIEW").length,
        rejected: own.filter((b) => b.status === "REJECTED").length,
        area: round2(complete.reduce((s, b) => s + (b.area || 0), 0)),
      };
    });

  const sorter = (a, b) =>
    b.points - a.points || b.builds - a.builds || a.minecraftName.localeCompare(b.minecraftName);
  const ranked = competitionRank(
    players.filter((p) => p.points > 0 && p.eligible).sort(sorter),
    (p) => p.points
  );

  const teamStats = teams.map((team) => {
    const members = players.filter((p) => p.teamId === team.id);
    const counted = members.filter((p) => judgeBuildsCount || !p.isJudge);
    const teamRanked = competitionRank(
      members.filter((p) => p.points > 0 && p.eligible).sort(sorter),
      (p) => p.points
    );
    return {
      id: team.id,
      name: team.name,
      emoji: team.emoji || null,
      color: team.color || "#5865F2",
      location: team.location || null,
      members: members.length,
      points: round2(counted.reduce((s, p) => s + p.points, 0)),
      builds: counted.reduce((s, p) => s + p.builds, 0),
      area: round2(counted.reduce((s, p) => s + p.area, 0)),
      ranking: teamRanked,
    };
  });

  const teamsRanked = competitionRank(
    [...teamStats].sort((a, b) => b.points - a.points || b.builds - a.builds),
    (t) => t.points
  );
  const leaders = teamsRanked.filter((t) => t.rank === 1);
  const anyPoints = teamsRanked.some((t) => t.points > 0);

  return {
    players,
    ranking: ranked,
    teams: teamsRanked,
    winner: anyPoints && leaders.length === 1 ? leaders[0] : null,
    draw: anyPoints && leaders.length > 1,
    totals: {
      points: round2(teamStats.reduce((s, t) => s + t.points, 0)),
      builds: builds.filter((b) => b.status === "COMPLETE").length,
      submitted: builds.length,
      pending: builds.filter((b) => b.status === "PENDING" || b.status === "IN_REVIEW").length,
      rejected: builds.filter((b) => b.status === "REJECTED").length,
      area: round2(teamStats.reduce((s, t) => s + t.area, 0)),
      participants: players.length,
    },
  };
}

function findPlayer(leaderboard, userId) {
  const player = leaderboard.players.find((p) => p.userId === String(userId));
  if (!player) return null;
  const ranked = leaderboard.ranking.find((p) => p.userId === String(userId));
  return { ...player, rank: ranked?.rank ?? null, of: leaderboard.ranking.length };
}

function paginate(list, page, pageSize = 10) {
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { items: list.slice(current * pageSize, (current + 1) * pageSize), page: current, pages };
}

module.exports = { buildLeaderboard, findPlayer, paginate, competitionRank };
