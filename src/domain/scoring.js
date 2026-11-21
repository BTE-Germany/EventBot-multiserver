// Pure scoring rules, no I/O.
//
// Every build is judged by one judge per team ("team:<id>" slot) plus one judge
// from the neutral group ("neutral" slot), so it needs teams + 1 votes.
// Effort and detail are averaged; base points are decided by vote.
const { z } = require("zod");

const NEUTRAL_SLOT = "neutral";

const scoringSchema = z
  .object({
    baseOptions: z.array(z.number().min(0).max(100)).min(1).max(10).default([0, 1, 2]),
    effortMax: z.number().positive().max(100).default(6),
    detailMax: z.number().positive().max(100).default(10),
    step: z.number().positive().max(10).default(0.5),
    // majority: most common vote wins, ties fall back to the rounded average
    baseVoteMode: z.enum(["majority", "average"]).default("majority"),
    // Rules: judges may build, but cannot win. Their points always count
    // for their team; they can never score their own builds.
    judgesCanWin: z.boolean().default(false),
  })
  .default({});

const DEFAULT_SCORING = scoringSchema.parse(undefined);

function parseScoring(raw) {
  const scoring = scoringSchema.parse(raw ?? undefined);
  return { ...scoring, baseOptions: [...new Set(scoring.baseOptions)].sort((a, b) => a - b) };
}

const round2 = (n) => Math.round(n * 100) / 100;

function teamSlot(teamId) {
  return `team:${teamId}`;
}

function slotOfJudge(judge) {
  return judge.teamId == null ? NEUTRAL_SLOT : teamSlot(judge.teamId);
}

function slotTeamId(slot) {
  return slot === NEUTRAL_SLOT ? null : Number(slot.slice(5));
}

function requiredSlots(teams) {
  return [...teams.map((t) => teamSlot(t.id)), NEUTRAL_SLOT];
}

// At least one judge for every team and one neutral judge, i.e. >= teams + 1
function judgeCoverage(teams, judges) {
  const slots = requiredSlots(teams).map((slot) => {
    const members = judges.filter((j) => slotOfJudge(j) === slot);
    return { slot, teamId: slotTeamId(slot), judges: members.length };
  });
  const missing = slots.filter((s) => s.judges === 0);
  return {
    required: slots.length,
    total: judges.length,
    slots,
    missing,
    // A slot with a single judge cannot judge that judge's own builds
    fragile: slots.filter((s) => s.judges === 1),
    ok: teams.length > 0 && missing.length === 0,
  };
}

// Accepts "4,5" as well as "4.5"
function parseScore(input) {
  if (typeof input === "number") return input;
  if (typeof input !== "string") return NaN;
  const trimmed = input.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return NaN;
  return Number(trimmed);
}

const onStep = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-9;

// Returns null when valid, otherwise { key, vars } for an i18n error message
function validateVote(values, scoring) {
  const { basePoints, effort, detail } = values;
  if (!Number.isFinite(basePoints) || !scoring.baseOptions.includes(basePoints)) {
    return { key: "judge.invalidBase", vars: { options: scoring.baseOptions.join(", ") } };
  }
  for (const [field, max] of [
    ["effort", scoring.effortMax],
    ["detail", scoring.detailMax],
  ]) {
    const v = values[field];
    if (!Number.isFinite(v) || v < 0 || v > max || !onStep(v, scoring.step)) {
      return { key: "judge.invalidScore", vars: { category: field, max, step: scoring.step } };
    }
  }
  return null;
}

function resolveBasePoints(values, scoring = DEFAULT_SCORING) {
  if (values.length === 0) return 0;
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const nearestOption = (target) =>
    scoring.baseOptions.reduce((best, o) =>
      Math.abs(o - target) < Math.abs(best - target) - 1e-9 ? o : best
    );
  if (scoring.baseVoteMode === "average") return round2(average);

  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const top = Math.max(...counts.values());
  const leaders = [...counts.keys()].filter((v) => counts.get(v) === top);
  if (leaders.length === 1) return leaders[0];
  // Tie: the option closest to the average, lower one on equal distance
  return nearestOption(average);
}

function aggregateVotes(votes, scoring = DEFAULT_SCORING) {
  if (votes.length === 0) return { basePoints: 0, effort: 0, detail: 0, total: 0 };
  const avg = (key) => round2(votes.reduce((sum, v) => sum + v[key], 0) / votes.length);
  const basePoints = resolveBasePoints(votes.map((v) => v.basePoints), scoring);
  const effort = avg("effort");
  const detail = avg("detail");
  return { basePoints, effort, detail, total: round2(basePoints + effort + detail) };
}

function slotProgress(teams, votes) {
  return requiredSlots(teams).map((slot) => ({
    slot,
    teamId: slotTeamId(slot),
    vote: votes.find((v) => v.slot === slot) || null,
  }));
}

function isComplete(teams, votes) {
  return slotProgress(teams, votes).every((s) => s.vote);
}

// Final values of a build: votes, then manual corrections on top
function evaluateBuild({ build, votes, teams, scoring = DEFAULT_SCORING }) {
  const aggregated = aggregateVotes(votes, scoring);
  const override = build.override || {};
  const pick = (key) => (typeof override[key] === "number" ? override[key] : aggregated[key]);
  const basePoints = pick("basePoints");
  const effort = pick("effort");
  const detail = pick("detail");
  const complete = isComplete(teams, votes);
  let status;
  if (build.status === "REJECTED") status = "REJECTED";
  else if (complete) status = "COMPLETE";
  else if (votes.length > 0) status = "IN_REVIEW";
  else status = "PENDING";
  return {
    status,
    complete,
    basePoints,
    effort,
    detail,
    total: round2(basePoints + effort + detail),
    // Points only count once every slot has voted
    awarded: status === "COMPLETE" ? round2(basePoints + effort + detail) : 0,
  };
}

function maxTotal(scoring = DEFAULT_SCORING) {
  return Math.max(...scoring.baseOptions) + scoring.effortMax + scoring.detailMax;
}

// Can this judge vote on this build? Returns { ok, slot, update } or { ok: false, reason }
function checkJudgeEligibility({ build, judge, votes, teams }) {
  if (!judge) return { ok: false, reason: "notJudge" };
  if (String(build.builderId) === String(judge.userId)) return { ok: false, reason: "ownBuild" };
  if (build.status === "REJECTED") return { ok: false, reason: "rejected" };
  const slot = slotOfJudge(judge);
  if (!requiredSlots(teams).includes(slot)) return { ok: false, reason: "noSlot" };
  const own = votes.find((v) => String(v.judgeId) === String(judge.userId));
  if (own) return { ok: true, slot: own.slot, update: true };
  if (votes.some((v) => v.slot === slot)) return { ok: false, reason: "slotTaken" };
  return { ok: true, slot, update: false };
}

// Score suggestions for autocomplete: 0..max in steps
function scoreSteps(max, step) {
  const count = Math.floor(max / step + 1e-9);
  return Array.from({ length: count + 1 }, (_, i) => round2(i * step));
}

module.exports = {
  NEUTRAL_SLOT,
  DEFAULT_SCORING,
  scoringSchema,
  parseScoring,
  teamSlot,
  slotOfJudge,
  slotTeamId,
  requiredSlots,
  judgeCoverage,
  parseScore,
  validateVote,
  resolveBasePoints,
  aggregateVotes,
  slotProgress,
  isComplete,
  evaluateBuild,
  maxTotal,
  checkJudgeEligibility,
  scoreSteps,
  round2,
};
