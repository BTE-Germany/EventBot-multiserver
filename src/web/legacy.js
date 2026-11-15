// The public API of the original bot. The response shape of GET /leaderboard
// must stay exactly as it was: { users, builds, points }, with the old field
// names (A = technique/details, B = effort, ...) and snowflakes as strings.
const { toJSON } = require("../core/json.js");

// The original stored the German reference labels
const LEGACY_REFERENCE = { "3d": "3D-Ansicht", streetview: "Streetview", images: "Bilder", other: "Sonstiges" };

function legacyUser(p) {
  return { id: String(p.userId), banned: p.banned, minecraft_id: p.minecraftName, points: p.points };
}

function legacyBuild(b) {
  const publicMsg = b.messages?.find((m) => m.kind === "public");
  const judgeMsg = b.messages?.find((m) => m.kind === "judge");
  return {
    id: b.id,
    message: publicMsg ? String(publicMsg.messageId) : null,
    judge_msg: judgeMsg ? String(judgeMsg.messageId) : null,
    location: b.location,
    A: b.detail,
    B: b.effort,
    base_points: b.basePoints,
    reference_type: LEGACY_REFERENCE[b.referenceType] ?? b.referenceType,
    reference_link: b.referenceLink,
    builder_id: String(b.builderId),
    judges: (b.votes || []).map((v) => String(v.judgeId)),
    images: b.images || [],
    created_timestamp: new Date(b.createdAt).toISOString(),
  };
}

function legacyLeaderboard({ participants, builds }) {
  // Same selection as before: not banned, more than 0 points, best first
  const users = participants
    .filter((p) => !p.banned && p.points > 0)
    .sort((a, b) => b.points - a.points)
    .map(legacyUser);
  return toJSON({
    users,
    builds: builds.map(legacyBuild),
    points: users.reduce((sum, u) => sum + u.points, 0),
  });
}

// Payload of the optional stats webhook, same shape as the original
function legacyWebhook({ participants, builds, now = new Date() }) {
  const users = participants.filter((p) => !p.banned).map((p) => ({ id: String(p.userId), points: p.points, minecraft_id: p.minecraftName }));
  return toJSON({
    users,
    builds: builds.filter((b) => b.status === "COMPLETE").map(legacyBuild),
    points: users.reduce((sum, u) => sum + u.points, 0),
    timestamp: now.toUTCString(),
  });
}

module.exports = { legacyLeaderboard, legacyWebhook, legacyBuild, LEGACY_REFERENCE };
