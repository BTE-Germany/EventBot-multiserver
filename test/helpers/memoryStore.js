// In-memory implementation of src/db/store.js for tests. Mirrors the unique
// constraints that matter (participant names, one vote per judge and slot).
const { SlotTakenError } = require("../../src/db/store.js");

function uniqueError() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function createMemoryStore() {
  const db = {
    settings: new Map(),
    guilds: new Map(),
    events: [],
    teams: [],
    eventGuilds: [],
    judges: [],
    participants: [],
    builds: [],
    votes: [],
    messages: [],
    activity: [],
  };
  const seq = { event: 0, team: 0, judge: 0, participant: 0, build: 0, vote: 0, message: 0, activity: 0 };
  const str = (v) => (v === null || v === undefined ? v : String(v));
  const withRelations = (b) =>
    b && {
      ...b,
      votes: db.votes.filter((v) => v.buildId === b.id).sort((x, y) => x.id - y.id),
      messages: db.messages.filter((m) => m.buildId === b.id),
    };

  const store = {
    db,
    async disconnect() {},

    async getSetting(key) {
      return db.settings.get(key);
    },
    async setSetting(key, value) {
      db.settings.set(key, value);
    },

    async getGuildConfig(id) {
      return db.guilds.get(String(id)) || null;
    },
    async listGuildConfigs() {
      return [...db.guilds.values()];
    },
    async upsertGuildConfig(id, data) {
      const row = { id: String(id), messageSubmissions: true, ...db.guilds.get(String(id)), ...data };
      db.guilds.set(String(id), row);
      return row;
    },

    async listEvents() {
      return [...db.events].sort((a, b) => b.id - a.id).map((e) => ({ ...e, _count: { builds: 0, participants: 0, teams: 0 } }));
    },
    async getEvent(id) {
      return db.events.find((e) => e.id === id) || null;
    },
    async createEvent(data) {
      const event = { id: ++seq.event, status: "DRAFT", startsAt: null, endsAt: null, createdAt: new Date(), ...data };
      db.events.push(event);
      return event;
    },
    async updateEvent(id, data) {
      const event = db.events.find((e) => e.id === id);
      Object.assign(event, data);
      return event;
    },
    async listEventsByStatus(statuses) {
      return db.events.filter((e) => statuses.includes(e.status));
    },
    async getEventBundle(eventId) {
      const event = db.events.find((e) => e.id === eventId);
      if (!event) return null;
      return {
        event: { ...event },
        teams: db.teams.filter((t) => t.eventId === eventId),
        guilds: db.eventGuilds.filter((g) => g.eventId === eventId),
        judges: db.judges.filter((j) => j.eventId === eventId),
      };
    },
    async findEventIdForGuild(guildId) {
      const links = db.eventGuilds
        .filter((g) => g.guildId === String(guildId))
        .filter((g) => db.events.find((e) => e.id === g.eventId)?.status !== "ARCHIVED")
        .sort((a, b) => b.eventId - a.eventId);
      return links[0]?.eventId ?? null;
    },

    async createTeam(data) {
      const team = { id: ++seq.team, color: "#5865F2", emoji: null, location: null, ...data };
      db.teams.push(team);
      return team;
    },
    async linkGuild(eventId, guildId, teamId) {
      db.eventGuilds = db.eventGuilds.filter((g) => !(g.eventId === eventId && g.guildId === String(guildId)));
      const link = { eventId, guildId: String(guildId), teamId };
      db.eventGuilds.push(link);
      return link;
    },
    async addJudge(data) {
      const judge = { id: ++seq.judge, ...data, userId: String(data.userId) };
      db.judges.push(judge);
      return judge;
    },

    async findParticipant(eventId, userId) {
      return db.participants.find((p) => p.eventId === eventId && p.userId === String(userId)) || null;
    },
    async findParticipantByMinecraft(eventId, name) {
      return db.participants.find((p) => p.eventId === eventId && p.minecraftKey === name.toLowerCase()) || null;
    },
    async getParticipant(id) {
      return db.participants.find((p) => p.id === id) || null;
    },
    async createParticipant(data) {
      if (await store.findParticipantByMinecraft(data.eventId, data.minecraftName)) throw uniqueError();
      const p = {
        id: ++seq.participant,
        banned: false,
        points: 0,
        registeredAt: new Date(),
        ...data,
        userId: String(data.userId),
        minecraftKey: data.minecraftName.toLowerCase(),
      };
      db.participants.push(p);
      return p;
    },
    async updateParticipant(id, data) {
      const p = db.participants.find((x) => x.id === id);
      Object.assign(p, data);
      return p;
    },
    async deleteParticipant(id) {
      const participant = db.participants.find((p) => p.id === id);
      const builds = db.builds.filter((b) => b.participantId === id).map(withRelations);
      for (const b of builds) await store.deleteBuild(b.id);
      db.participants = db.participants.filter((p) => p.id !== id);
      db.activity = db.activity.filter((a) => !(a.eventId === participant.eventId && String(a.userId) === participant.userId));
      return { participant, builds };
    },
    async purgeEvent(eventId) {
      const builds = db.builds.filter((b) => b.eventId === eventId);
      for (const b of builds) await store.deleteBuild(b.id);
      db.participants = db.participants.filter((p) => p.eventId !== eventId);
      db.judges = db.judges.filter((j) => j.eventId !== eventId);
      db.activity = db.activity.filter((a) => a.eventId !== eventId);
      return { images: builds.flatMap((b) => b.images) };
    },
    async listParticipants(eventId) {
      return db.participants.filter((p) => p.eventId === eventId);
    },
    async participationsOfUser(userId) {
      return db.participants.filter((p) => p.userId === String(userId));
    },

    async createBuild(data) {
      const build = {
        id: ++seq.build,
        status: "PENDING",
        basePoints: 0,
        effort: 0,
        detail: 0,
        total: 0,
        override: null,
        extraInfo: null,
        rejectReason: null,
        completedAt: null,
        createdAt: new Date(),
        images: [],
        area: null,
        ...data,
        builderId: String(data.builderId),
        guildId: str(data.guildId),
      };
      db.builds.push(build);
      return withRelations(build);
    },
    async getBuild(id) {
      return withRelations(db.builds.find((b) => b.id === id));
    },
    async updateBuild(id, data) {
      const build = db.builds.find((b) => b.id === id);
      Object.assign(build, data);
      return withRelations(build);
    },
    async deleteBuild(id) {
      db.builds = db.builds.filter((b) => b.id !== id);
      db.votes = db.votes.filter((v) => v.buildId !== id);
      db.messages = db.messages.filter((m) => m.buildId !== id);
    },
    async listBuilds(eventId, { status, participantId, take, skip = 0, orderBy = "desc" } = {}) {
      const statuses = status ? [].concat(status) : null;
      return db.builds
        .filter((b) => b.eventId === eventId)
        .filter((b) => !statuses || statuses.includes(b.status))
        .filter((b) => !participantId || b.participantId === participantId)
        .sort((a, b) => (orderBy === "asc" ? a.id - b.id : b.id - a.id))
        .slice(skip, take ? skip + take : undefined)
        .map(withRelations);
    },
    async listBuildSummaries(eventId) {
      return db.builds.filter((b) => b.eventId === eventId).map((b) => ({ ...b }));
    },
    async searchBuilds(eventId, { query = "", statuses, missingSlot, limit = 25 } = {}) {
      return db.builds
        .filter((b) => b.eventId === eventId)
        .filter((b) => !statuses || statuses.includes(b.status))
        .filter((b) => !missingSlot || !db.votes.some((v) => v.buildId === b.id && v.slot === missingSlot))
        .filter((b) => String(b.id).startsWith(String(query)))
        .slice(0, limit);
    },

    async upsertVote({ buildId, judgeId, judgeName, slot, basePoints, effort, detail }) {
      const own = db.votes.find((v) => v.buildId === buildId && v.judgeId === String(judgeId));
      if (own) {
        Object.assign(own, { judgeName, basePoints, effort, detail });
        return own;
      }
      if (db.votes.some((v) => v.buildId === buildId && v.slot === slot)) throw new SlotTakenError(slot);
      const vote = { id: ++seq.vote, buildId, judgeId: String(judgeId), judgeName, slot, basePoints, effort, detail, createdAt: new Date() };
      db.votes.push(vote);
      return vote;
    },
    async clearVotes(buildId) {
      db.votes = db.votes.filter((v) => v.buildId !== buildId);
    },

    async addBuildMessage(data) {
      const m = { id: ++seq.message, ...data, guildId: String(data.guildId), channelId: String(data.channelId), messageId: String(data.messageId) };
      db.messages.push(m);
      return m;
    },
    async removeBuildMessage(id) {
      db.messages = db.messages.filter((m) => m.id !== id);
    },

    async recalculateParticipant(participantId) {
      const p = db.participants.find((x) => x.id === participantId);
      if (!p) return null;
      const points =
        Math.round(
          db.builds
            .filter((b) => b.participantId === participantId && b.status === "COMPLETE")
            .reduce((s, b) => s + b.total, 0) * 100
        ) / 100;
      const before = p.points;
      p.points = points;
      return { before, after: points, delta: Math.round((points - before) * 100) / 100 };
    },

    async logActivity(entry) {
      db.activity.push({ id: ++seq.activity, createdAt: new Date(), ...entry });
    },
    async listActivity({ eventId } = {}) {
      return db.activity.filter((a) => !eventId || a.eventId === eventId).reverse();
    },
    async counts() {
      return { events: db.events.length, participants: db.participants.length, builds: db.builds.length, guilds: db.guilds.size };
    },
  };
  return store;
}

module.exports = { createMemoryStore };
