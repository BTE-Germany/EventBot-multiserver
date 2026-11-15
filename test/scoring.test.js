const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("../src/domain/scoring.js");

const teams = [{ id: 1 }, { id: 2 }];
const vote = (slot, basePoints, effort, detail, judgeId = slot) => ({ slot, basePoints, effort, detail, judgeId });

test("defaults follow the event brief: base 0–2, effort 0–6, details 0–10", () => {
  assert.deepEqual(s.DEFAULT_SCORING.baseOptions, [0, 1, 2]);
  assert.equal(s.DEFAULT_SCORING.effortMax, 6);
  assert.equal(s.DEFAULT_SCORING.detailMax, 10);
  assert.equal(s.maxTotal(), 18);
  assert.equal(s.DEFAULT_SCORING.judgesCanWin, false);
});

test("a build needs one judge per team plus a neutral judge", () => {
  assert.deepEqual(s.requiredSlots(teams), ["team:1", "team:2", "neutral"]);
  const votes = [vote("team:1", 2, 4, 6), vote("team:2", 2, 5, 7)];
  assert.equal(s.isComplete(teams, votes), false);
  assert.equal(s.isComplete(teams, [...votes, vote("neutral", 2, 3, 8)]), true);
});

test("judge coverage requires at least teams + 1 judges", () => {
  const judges = [{ teamId: 1 }, { teamId: 2 }];
  const partial = s.judgeCoverage(teams, judges);
  assert.equal(partial.required, 3);
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.missing.map((m) => m.slot), ["neutral"]);
  const full = s.judgeCoverage(teams, [...judges, { teamId: null }, { teamId: 1 }]);
  assert.equal(full.ok, true);
  assert.deepEqual(full.fragile.map((f) => f.slot), ["team:2", "neutral"]);
  assert.equal(s.judgeCoverage([], []).ok, false);
});

test("base points: majority vote, ties go to the option nearest the average", () => {
  assert.equal(s.resolveBasePoints([2, 2, 1]), 2);
  assert.equal(s.resolveBasePoints([1, 1, 2]), 1);
  assert.equal(s.resolveBasePoints([2, 1, 0]), 1);
  // 2,2,1,1 → average 1.5, equally close to 1 and 2 → lower one
  assert.equal(s.resolveBasePoints([2, 2, 1, 1]), 1);
  assert.equal(s.resolveBasePoints([]), 0);
  assert.equal(s.resolveBasePoints([2, 1, 1], { ...s.DEFAULT_SCORING, baseVoteMode: "average" }), 1.33);
});

test("effort and details are averaged", () => {
  const result = s.aggregateVotes([vote("team:1", 2, 4, 6), vote("team:2", 2, 5, 7), vote("neutral", 1, 3, 8)]);
  assert.deepEqual(result, { basePoints: 2, effort: 4, detail: 7, total: 13 });
  assert.equal(s.aggregateVotes([vote("a", 2, 4.5, 7), vote("b", 2, 5, 6)]).effort, 4.75);
});

test("evaluateBuild: status, awarded points and corrections", () => {
  const all = [vote("team:1", 2, 4, 6), vote("team:2", 2, 5, 7), vote("neutral", 2, 3, 8)];
  assert.equal(s.evaluateBuild({ build: {}, votes: [], teams }).status, "PENDING");
  const partial = s.evaluateBuild({ build: {}, votes: all.slice(0, 1), teams });
  assert.equal(partial.status, "IN_REVIEW");
  assert.equal(partial.awarded, 0);
  const done = s.evaluateBuild({ build: {}, votes: all, teams });
  assert.equal(done.status, "COMPLETE");
  assert.equal(done.awarded, 13);
  const corrected = s.evaluateBuild({ build: { override: { basePoints: 1 } }, votes: all, teams });
  assert.equal(corrected.total, 12);
  const rejected = s.evaluateBuild({ build: { status: "REJECTED" }, votes: all, teams });
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.awarded, 0);
});

test("eligibility: own builds, taken slots and updates", () => {
  const build = { builderId: "9", status: "PENDING" };
  const judge = { userId: "1", teamId: 1 };
  assert.deepEqual(s.checkJudgeEligibility({ build, judge: null, votes: [], teams }), { ok: false, reason: "notJudge" });
  assert.equal(s.checkJudgeEligibility({ build: { ...build, builderId: "1" }, judge, votes: [], teams }).reason, "ownBuild");
  assert.deepEqual(s.checkJudgeEligibility({ build, judge, votes: [], teams }), { ok: true, slot: "team:1", update: false });
  const taken = [vote("team:1", 2, 1, 1, "2")];
  assert.equal(s.checkJudgeEligibility({ build, judge, votes: taken, teams }).reason, "slotTaken");
  const own = [vote("team:1", 2, 1, 1, "1")];
  assert.deepEqual(s.checkJudgeEligibility({ build, judge, votes: own, teams }), { ok: true, slot: "team:1", update: true });
  assert.equal(s.checkJudgeEligibility({ build: { ...build, status: "REJECTED" }, judge, votes: [], teams }).reason, "rejected");
  assert.equal(s.checkJudgeEligibility({ build, judge: { userId: "1", teamId: 99 }, votes: [], teams }).reason, "noSlot");
  assert.equal(s.checkJudgeEligibility({ build, judge: { userId: "1", teamId: null }, votes: [], teams }).slot, "neutral");
});

test("vote validation respects ranges and steps", () => {
  const sc = s.DEFAULT_SCORING;
  assert.equal(s.validateVote({ basePoints: 2, effort: 4.5, detail: 10 }, sc), null);
  assert.equal(s.validateVote({ basePoints: 3, effort: 1, detail: 1 }, sc).key, "judge.invalidBase");
  assert.equal(s.validateVote({ basePoints: 2, effort: 6.5, detail: 1 }, sc).key, "judge.invalidScore");
  assert.equal(s.validateVote({ basePoints: 2, effort: 4.25, detail: 1 }, sc).key, "judge.invalidScore");
  assert.equal(s.validateVote({ basePoints: 2, effort: NaN, detail: 1 }, sc).key, "judge.invalidScore");
});

test("parseScore accepts comma decimals", () => {
  assert.equal(s.parseScore("4,5"), 4.5);
  assert.equal(s.parseScore(" 7 "), 7);
  assert.ok(Number.isNaN(s.parseScore("abc")));
  assert.ok(Number.isNaN(s.parseScore("-1")));
});

test("scoreSteps and parseScoring", () => {
  assert.deepEqual(s.scoreSteps(2, 0.5), [0, 0.5, 1, 1.5, 2]);
  assert.equal(s.scoreSteps(10, 0.5).length, 21);
  assert.deepEqual(s.parseScoring({ baseOptions: [2, 0, 1, 1] }).baseOptions, [0, 1, 2]);
  assert.throws(() => s.parseScoring({ effortMax: -1 }));
  assert.equal(s.parseScoring(null).effortMax, 6);
});
