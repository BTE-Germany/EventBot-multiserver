// Per-server configuration (channels, roles, language)
const { z } = require("zod");
const { createCache } = require("../core/cache.js");
const { TOPICS } = require("../core/bus.js");

const optionalId = z.union([z.string().regex(/^\d{17,20}$/), z.null()]).optional();

const guildConfigSchema = z
  .object({
    locale: z.string().nullable().optional(),
    submissionChannelId: optionalId,
    judgeChannelId: optionalId,
    leaderboardChannelId: optionalId,
    announcementChannelId: optionalId,
    judgeRoleId: optionalId,
    messageSubmissions: z.boolean().optional(),
  })
  .strict();

const ID_FIELDS = ["submissionChannelId", "judgeChannelId", "leaderboardChannelId", "announcementChannelId", "judgeRoleId"];

function createGuildConfigService({ store, bus }) {
  const cache = createCache({ ttlMs: 30000 });
  bus?.subscribe(({ topic, payload }) => {
    if (topic === TOPICS.CONFIG && payload.scope === "guild") {
      payload.guildId ? cache.delete(String(payload.guildId)) : cache.clear();
    }
  });

  return {
    schema: guildConfigSchema,
    async get(guildId) {
      if (!guildId) return null;
      return cache.get(String(guildId), () => store.getGuildConfig(guildId));
    },
    async update(guildId, patch, { name } = {}) {
      const parsed = guildConfigSchema.parse(patch);
      const data = { ...parsed, ...(name ? { name } : {}) };
      for (const field of ID_FIELDS) {
        if (field in data) data[field] = data[field] ? BigInt(data[field]) : null;
      }
      // Changing the channel invalidates the stored leaderboard message
      if ("leaderboardChannelId" in data) data.leaderboardMessageId = null;
      const row = await store.upsertGuildConfig(guildId, data);
      bus?.publish(TOPICS.CONFIG, { scope: "guild", guildId: String(guildId) });
      return row;
    },
    async setLeaderboardMessage(guildId, messageId) {
      await store.upsertGuildConfig(guildId, { leaderboardMessageId: messageId ? BigInt(messageId) : null });
      bus?.publish(TOPICS.CONFIG, { scope: "guild", guildId: String(guildId) });
    },
    invalidate: (guildId) => (guildId ? cache.delete(String(guildId)) : cache.clear()),
  };
}

module.exports = { createGuildConfigService, guildConfigSchema };
