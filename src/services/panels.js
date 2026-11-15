// Posts and updates Discord messages through the REST API only, so this works
// from any thread: the shards (after interactions) and the main thread
// (scheduler, dashboard) without needing a gateway connection.
const { Routes } = require("discord.js");
const { translator } = require("../i18n/index.js");
const { buildPanel } = require("../discord/views/buildPanel.js");
const { battleBoard, announcementView, wrapupView, phaseText } = require("../discord/views/leaderboard.js");
const { teamLabel } = require("./events.js");

const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_CHANNEL = 10003;
const isGone = (err) => [UNKNOWN_MESSAGE, UNKNOWN_CHANNEL].includes(err?.code) || err?.status === 404;

function createPanelService({ rest, store, events, guildConfigs, settings, stats, cards, log }) {
  async function localeOf(guildId) {
    const [config, global] = await Promise.all([guildConfigs.get(guildId), settings.get()]);
    return config?.locale || global.defaultLocale;
  }

  async function send(channelId, payload, files) {
    return rest.post(Routes.channelMessages(String(channelId)), { body: payload, ...(files ? { files } : {}) });
  }

  async function edit(channelId, messageId, payload, files) {
    const body = files ? { ...payload, attachments: files.map((f, i) => ({ id: i, filename: f.name })) } : payload;
    return rest.patch(Routes.channelMessage(String(channelId), String(messageId)), { body, ...(files ? { files } : {}) });
  }

  async function panelPayload(bundle, build, guildId, view) {
    const t = translator(await localeOf(guildId));
    const participant = build.participant || (await store.getParticipant(build.participantId));
    return buildPanel({ bundle, build, participant, t, view });
  }

  return {
    send,
    edit,
    localeOf,

    // New build: public panel in the builder's server, judge panel in every event server
    async publish(build) {
      const bundle = await events.bundle(build.eventId);
      const tasks = [];
      const builderConfig = build.guildId ? await guildConfigs.get(build.guildId) : null;
      if (builderConfig?.submissionChannelId) {
        tasks.push(
          (async () => {
            const payload = await panelPayload(bundle, build, build.guildId, "public");
            const msg = await send(builderConfig.submissionChannelId, payload);
            await store.addBuildMessage({ buildId: build.id, guildId: build.guildId, channelId: msg.channel_id, messageId: msg.id, kind: "public" });
          })()
        );
      }
      for (const link of bundle.guilds) {
        tasks.push(
          (async () => {
            const config = await guildConfigs.get(link.guildId);
            if (!config?.judgeChannelId) return;
            const payload = await panelPayload(bundle, build, link.guildId, "judge");
            if (config.judgeRoleId) {
              const t = translator(await localeOf(link.guildId));
              const team = bundle.team(build.teamId);
              payload.content = t("panel.judgePing", { role: `<@&${config.judgeRoleId}>`, id: build.id, team: team ? teamLabel(team) : "—" });
              payload.allowed_mentions = { roles: [String(config.judgeRoleId)] };
            }
            const msg = await send(config.judgeChannelId, payload);
            await store.addBuildMessage({ buildId: build.id, guildId: link.guildId, channelId: msg.channel_id, messageId: msg.id, kind: "judge" });
          })()
        );
      }
      const results = await Promise.allSettled(tasks);
      for (const r of results) if (r.status === "rejected") log?.warn(`Panel for build #${build.id} not posted:`, r.reason?.message);
    },

    // Redraws every panel of a build, e.g. after a vote
    async refresh(buildId) {
      const build = await store.getBuild(buildId);
      if (!build) return { updated: 0, missing: 0 };
      const bundle = await events.bundle(build.eventId);
      let updated = 0;
      let missing = 0;
      await Promise.all(
        build.messages.map(async (m) => {
          try {
            const payload = await panelPayload(bundle, build, m.guildId, m.kind);
            await edit(m.channelId, m.messageId, payload);
            updated++;
          } catch (err) {
            if (isGone(err)) {
              missing++;
              await store.removeBuildMessage(m.id);
            } else {
              log?.warn(`Panel ${m.messageId} of build #${buildId} not updated:`, err.message);
            }
          }
        })
      );
      return { updated, missing };
    },

    async removeMessages(build) {
      await Promise.allSettled(
        (build.messages || []).map((m) => rest.delete(Routes.channelMessage(String(m.channelId), String(m.messageId))))
      );
    },

    // The team battle board in each server's leaderboard channel
    async updateBoards(eventId) {
      const bundle = await events.bundle(eventId);
      if (!bundle) return 0;
      stats.invalidate(eventId);
      const lb = await stats.leaderboard(bundle);
      const images = new Map(); // one render per language
      let count = 0;
      for (const link of bundle.guilds) {
        const config = await guildConfigs.get(link.guildId);
        if (!config?.leaderboardChannelId) continue;
        try {
          const locale = await localeOf(link.guildId);
          const t = translator(locale);
          if (!images.has(locale)) {
            images.set(locale, await cards.battle({ bundle, lb, t, subtitle: phaseText(bundle.event, t) }));
          }
          const png = images.get(locale);
          const files = png ? [{ name: "battle.png", data: png, contentType: "image/png" }] : undefined;
          const payload = battleBoard({ bundle, lb, t, imageName: png ? "battle.png" : null });
          if (config.leaderboardMessageId) {
            try {
              await edit(config.leaderboardChannelId, config.leaderboardMessageId, payload, files);
              count++;
              continue;
            } catch (err) {
              if (!isGone(err)) throw err;
            }
          }
          const msg = await send(config.leaderboardChannelId, payload, files);
          await guildConfigs.setLeaderboardMessage(link.guildId, msg.id);
          count++;
        } catch (err) {
          log?.warn(`Board in server ${link.guildId} not updated:`, err.message);
        }
      }
      return count;
    },

    // Start/end announcements and the wrap-up, each in the server's language
    async announce(eventId, kind) {
      const bundle = await events.bundle(eventId);
      if (!bundle) return 0;
      const lb = kind === "wrapup" ? await stats.leaderboard(bundle) : null;
      let count = 0;
      for (const link of bundle.guilds) {
        const config = await guildConfigs.get(link.guildId);
        const channelId = config?.announcementChannelId || config?.leaderboardChannelId;
        if (!channelId) continue;
        try {
          const t = translator(await localeOf(link.guildId));
          const payload = kind === "wrapup" ? wrapupView({ bundle, lb, t }) : announcementView({ bundle, kind, t });
          await send(channelId, payload);
          count++;
        } catch (err) {
          log?.warn(`Announcement in server ${link.guildId} failed:`, err.message);
        }
      }
      return count;
    },

    // Direct message, e.g. a rejection notice; the builder may have DMs closed
    async dm(userId, payload) {
      try {
        const channel = await rest.post(Routes.userChannels(), { body: { recipient_id: String(userId) } });
        await send(channel.id, payload);
        return true;
      } catch {
        return false;
      }
    },
  };
}

module.exports = { createPanelService, isGone };
