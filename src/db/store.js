// All database access goes through this store. Services only see these
// methods, which keeps Prisma out of the business logic and lets the tests
// swap in an in-memory implementation (test/helpers/memoryStore.js).
const { PrismaClient, Prisma } = require("@prisma/client");

class SlotTakenError extends Error {}

const BUILD_INCLUDE = { votes: { orderBy: { createdAt: "asc" } }, messages: true };

function createPrismaClient() {
  return new PrismaClient({ log: ["warn", "error"] });
}

function createStore(prisma = createPrismaClient()) {
  const big = (id) => (id === null || id === undefined ? null : BigInt(id));

  return {
    prisma,
    disconnect: () => prisma.$disconnect(),

    // ---------- settings ----------
    async getSetting(key) {
      const row = await prisma.setting.findUnique({ where: { key } });
      return row ? row.value : undefined;
    },
    setSetting: (key, value) =>
      prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),

    // ---------- guilds ----------
    getGuildConfig: (id) => prisma.guildConfig.findUnique({ where: { id: big(id) } }),
    listGuildConfigs: () => prisma.guildConfig.findMany(),
    upsertGuildConfig: (id, data) =>
      prisma.guildConfig.upsert({ where: { id: big(id) }, create: { id: big(id), ...data }, update: data }),

    // ---------- events ----------
    listEvents: () =>
      prisma.event.findMany({
        orderBy: { id: "desc" },
        include: { _count: { select: { builds: true, participants: true, teams: true } } },
      }),
    getEvent: (id) => prisma.event.findUnique({ where: { id } }),
    createEvent: (data) => prisma.event.create({ data }),
    updateEvent: (id, data) => prisma.event.update({ where: { id }, data }),
    deleteEvent: (id) => prisma.event.delete({ where: { id } }),
    listEventsByStatus: (statuses) => prisma.event.findMany({ where: { status: { in: statuses } } }),

    // Event, teams, linked servers and judges in one go
    async getEventBundle(eventId) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
          teams: { orderBy: { id: "asc" } },
          guilds: true,
          judges: { orderBy: { id: "asc" } },
        },
      });
      if (!event) return null;
      const { teams, guilds, judges, ...rest } = event;
      return { event: rest, teams, guilds, judges };
    },

    // The newest non-archived event a server takes part in
    async findEventIdForGuild(guildId) {
      const link = await prisma.eventGuild.findFirst({
        where: { guildId: big(guildId), event: { status: { not: "ARCHIVED" } } },
        orderBy: { eventId: "desc" },
      });
      return link?.eventId ?? null;
    },

    // ---------- teams / servers / judges ----------
    createTeam: (data) => prisma.team.create({ data }),
    updateTeam: (id, data) => prisma.team.update({ where: { id }, data }),
    deleteTeam: (id) => prisma.team.delete({ where: { id } }),
    linkGuild: (eventId, guildId, teamId) =>
      prisma.eventGuild.upsert({
        where: { eventId_guildId: { eventId, guildId: big(guildId) } },
        create: { eventId, guildId: big(guildId), teamId },
        update: { teamId },
      }),
    unlinkGuild: (eventId, guildId) =>
      prisma.eventGuild.delete({ where: { eventId_guildId: { eventId, guildId: big(guildId) } } }),
    addJudge: (data) =>
      prisma.judge.upsert({
        where: { eventId_userId: { eventId: data.eventId, userId: big(data.userId) } },
        create: { ...data, userId: big(data.userId) },
        update: { teamId: data.teamId, displayName: data.displayName },
      }),
    removeJudge: (id) => prisma.judge.delete({ where: { id } }),

    // ---------- participants ----------
    findParticipant: (eventId, userId) =>
      prisma.participant.findUnique({ where: { eventId_userId: { eventId, userId: big(userId) } } }),
    findParticipantByMinecraft: (eventId, name) =>
      prisma.participant.findUnique({
        where: { eventId_minecraftKey: { eventId, minecraftKey: name.toLowerCase() } },
      }),
    getParticipant: (id) => prisma.participant.findUnique({ where: { id } }),
    createParticipant: (data) =>
      prisma.participant.create({
        data: { ...data, userId: big(data.userId), minecraftKey: data.minecraftName.toLowerCase() },
      }),
    updateParticipant: (id, data) =>
      prisma.participant.update({
        where: { id },
        data: data.minecraftName ? { ...data, minecraftKey: data.minecraftName.toLowerCase() } : data,
      }),
    // GDPR erasure: the participant with all builds, votes and panels (cascade)
    async deleteParticipant(id) {
      const builds = await prisma.build.findMany({ where: { participantId: id }, include: { messages: true } });
      const participant = await prisma.participant.delete({ where: { id } });
      await prisma.activity.deleteMany({ where: { eventId: participant.eventId, userId: participant.userId } });
      return { participant, builds };
    },
    // Retention: removes all personal data of an event, keeps the event and teams
    async purgeEvent(eventId) {
      const builds = await prisma.build.findMany({ where: { eventId }, select: { images: true } });
      await prisma.$transaction([
        prisma.participant.deleteMany({ where: { eventId } }),
        prisma.judge.deleteMany({ where: { eventId } }),
        prisma.activity.deleteMany({ where: { eventId } }),
      ]);
      return { images: builds.flatMap((b) => b.images) };
    },
    listParticipants: (eventId) =>
      prisma.participant.findMany({ where: { eventId }, orderBy: { points: "desc" } }),
    participationsOfUser: (userId) =>
      prisma.participant.findMany({
        where: { userId: big(userId) },
        include: { event: true, _count: { select: { builds: { where: { status: "COMPLETE" } } } } },
      }),

    // ---------- builds ----------
    createBuild: (data) =>
      prisma.build.create({
        data: { ...data, builderId: big(data.builderId), guildId: big(data.guildId) },
        include: BUILD_INCLUDE,
      }),
    getBuild: (id) => prisma.build.findUnique({ where: { id }, include: BUILD_INCLUDE }),
    updateBuild: (id, data) => prisma.build.update({ where: { id }, data, include: BUILD_INCLUDE }),
    deleteBuild: (id) => prisma.build.delete({ where: { id } }),
    listBuilds: (eventId, { status, participantId, take, skip, orderBy = "desc" } = {}) =>
      prisma.build.findMany({
        where: {
          eventId,
          ...(status ? { status: Array.isArray(status) ? { in: status } : status } : {}),
          ...(participantId ? { participantId } : {}),
        },
        include: BUILD_INCLUDE,
        orderBy: { id: orderBy },
        take,
        skip,
      }),
    // Lean rows for leaderboards and statistics
    listBuildSummaries: (eventId) =>
      prisma.build.findMany({
        where: { eventId },
        select: {
          id: true, participantId: true, teamId: true, status: true, total: true, area: true,
          basePoints: true, effort: true, detail: true, referenceType: true, createdAt: true,
          completedAt: true, builderId: true,
        },
      }),
    // Autocomplete: builds whose ID starts with the typed digits
    async searchBuilds(eventId, { query = "", statuses, missingSlot, limit = 25 } = {}) {
      const builds = await prisma.build.findMany({
        where: {
          eventId,
          ...(statuses ? { status: { in: statuses } } : {}),
          ...(missingSlot ? { votes: { none: { slot: missingSlot } } } : {}),
        },
        select: { id: true, location: true, status: true, builderId: true, _count: { select: { votes: true } } },
        orderBy: { id: missingSlot ? "asc" : "desc" },
        take: 500,
      });
      return builds.filter((b) => String(b.id).startsWith(String(query).trim())).slice(0, limit);
    },
    clearEventBuilds: (eventId) =>
      prisma.$transaction([
        prisma.build.deleteMany({ where: { eventId } }),
        prisma.participant.updateMany({ where: { eventId }, data: { points: 0 } }),
      ]),

    // ---------- votes ----------
    async upsertVote({ buildId, judgeId, judgeName, slot, basePoints, effort, detail }) {
      try {
        return await prisma.vote.upsert({
          where: { buildId_judgeId: { buildId, judgeId: big(judgeId) } },
          create: { buildId, judgeId: big(judgeId), judgeName, slot, basePoints, effort, detail },
          update: { judgeName, basePoints, effort, detail },
        });
      } catch (err) {
        // Unique (buildId, slot): another judge of the same group was faster
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new SlotTakenError(slot);
        }
        throw err;
      }
    },
    clearVotes: (buildId) => prisma.vote.deleteMany({ where: { buildId } }),

    // ---------- panel messages ----------
    addBuildMessage: (data) =>
      prisma.buildMessage.upsert({
        where: { buildId_channelId: { buildId: data.buildId, channelId: big(data.channelId) } },
        create: { ...data, guildId: big(data.guildId), channelId: big(data.channelId), messageId: big(data.messageId) },
        update: { messageId: big(data.messageId) },
      }),
    removeBuildMessage: (id) => prisma.buildMessage.delete({ where: { id } }).catch(() => null),

    // Points are always recalculated from scratch, so they stay right after
    // judging, corrections, rejections and deletions
    async recalculateParticipant(participantId) {
      const participant = await prisma.participant.findUnique({ where: { id: participantId } });
      if (!participant) return null;
      const { _sum } = await prisma.build.aggregate({
        where: { participantId, status: "COMPLETE" },
        _sum: { total: true },
      });
      const points = Math.round((_sum.total || 0) * 100) / 100;
      await prisma.participant.update({ where: { id: participantId }, data: { points } });
      return { before: participant.points, after: points, delta: Math.round((points - participant.points) * 100) / 100 };
    },

    // ---------- activity ----------
    async logActivity({ eventId = null, type, buildId = null, userId = null, actor = null, points = null, details = null }) {
      try {
        await prisma.activity.create({
          data: { eventId, type, buildId, userId: big(userId), actor, points, details },
        });
      } catch {
        // the log must never break the action itself
      }
    },
    listActivity: ({ eventId, limit = 100, before } = {}) =>
      prisma.activity.findMany({
        where: { ...(eventId ? { eventId } : {}), ...(before ? { id: { lt: before } } : {}) },
        orderBy: { id: "desc" },
        take: Math.min(limit, 500),
      }),

    async counts() {
      const [events, participants, builds, guilds] = await Promise.all([
        prisma.event.count(),
        prisma.participant.count(),
        prisma.build.count(),
        prisma.guildConfig.count(),
      ]);
      return { events, participants, builds, guilds };
    },
  };
}

module.exports = { createStore, createPrismaClient, SlotTakenError };
