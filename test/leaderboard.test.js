const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLeaderboard, findPlayer, paginate, competitionRank } = require("../src/domain/leaderboard.js");
const { DEFAULT_SCORING } = require("../src/domain/scoring.js");

const teams = [
  { id: 1, name: "Germany", color: "#FFCC00", location: "Lübeck" },
  { id: 2, name: "Poland", color: "#DC143C", location: "Opole" },
];
const participants = [
  { id: 1, userId: "11", minecraftName: "Anna", teamId: 1, banned: false },
  { id: 2, userId: "12", minecraftName: "Bartek", teamId: 2, banned: false },
  { id: 3, userId: "13", minecraftName: "Carl", teamId: 1, banned: false },
  { id: 4, userId: "14", minecraftName: "Dora", teamId: 2, banned: true },
  { id: 5, userId: "99", minecraftName: "JudgeJoe", teamId: 1, banned: false },
];
const builds = [
  { participantId: 1, status: "COMPLETE", total: 15, area: 120 },
  { participantId: 1, status: "COMPLETE", total: 10, area: 80 },
  { participantId: 2, status: "COMPLETE", total: 25, area: 300 },
  { participantId: 3, status: "PENDING", total: 0, area: 50 },
  { participantId: 3, status: "REJECTED", total: 9, area: 10 },
  { participantId: 4, status: "COMPLETE", total: 100, area: 1 },
  { participantId: 5, status: "COMPLETE", total: 30, area: 40 },
];

const lb = buildLeaderboard({ participants, builds, teams, judgeUserIds: ["99"], scoring: DEFAULT_SCORING });

test("ranking excludes banned players and judges, ties share a rank", () => {
  assert.deepEqual(lb.ranking.map((p) => [p.minecraftName, p.points, p.rank]), [
    ["Anna", 25, 1],
    ["Bartek", 25, 1],
  ]);
  assert.equal(lb.players.find((p) => p.minecraftName === "JudgeJoe").eligible, false);
});

test("judges can win when the event allows it", () => {
  const open = buildLeaderboard({ participants, builds, teams, judgeUserIds: ["99"], scoring: { ...DEFAULT_SCORING, judgesCanWin: true } });
  assert.equal(open.ranking[0].minecraftName, "JudgeJoe");
});

test("team totals count only completed builds, including the judges' builds", () => {
  const germany = lb.teams.find((t) => t.name === "Germany");
  const poland = lb.teams.find((t) => t.name === "Poland");
  assert.equal(germany.points, 55);
  assert.equal(germany.builds, 3);
  assert.equal(germany.area, 240);
  assert.equal(poland.points, 25);
  assert.equal(lb.winner.name, "Germany");
  assert.equal(lb.draw, false);
});

test("totals and personal stats", () => {
  assert.equal(lb.totals.submitted, 7);
  assert.equal(lb.totals.pending, 1);
  assert.equal(lb.totals.rejected, 1);
  const carl = findPlayer(lb, "13");
  assert.equal(carl.rank, null);
  assert.equal(carl.pending, 1);
  assert.equal(carl.rejected, 1);
  assert.equal(findPlayer(lb, "11").of, 2);
  assert.equal(findPlayer(lb, "nobody"), null);
});

test("no points yet means no winner and no draw", () => {
  const empty = buildLeaderboard({ participants: [], builds: [], teams, scoring: DEFAULT_SCORING });
  assert.equal(empty.winner, null);
  assert.equal(empty.draw, false);
});

test("paginate clamps pages", () => {
  const list = Array.from({ length: 23 }, (_, i) => i);
  assert.deepEqual(paginate(list, 2, 10), { items: [20, 21, 22], page: 2, pages: 3 });
  assert.equal(paginate(list, 9, 10).page, 2);
  assert.equal(paginate([], 0).pages, 1);
  assert.deepEqual(competitionRank([{ s: 5 }, { s: 5 }, { s: 3 }], (x) => x.s).map((x) => x.rank), [1, 1, 3]);
});
