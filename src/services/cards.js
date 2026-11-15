// Renders localized PNG cards on the worker pool
const { battleCard, profileCard } = require("../render/cards.js");
const { eventProgress } = require("../domain/eventWindow.js");
const { teamLabel } = require("./events.js");

function createCardService({ pool, log, fetchImpl = fetch }) {
  async function rasterize(svg) {
    const png = await pool.run("renderSvg", { svg });
    return Buffer.from(png.buffer, png.byteOffset, png.byteLength);
  }

  // Avatars are embedded into the SVG; a failed download just shows the initial
  async function avatarDataUri(url) {
    if (!url) return null;
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return `data:${res.headers.get("content-type") || "image/png"};base64,${buf.toString("base64")}`;
    } catch {
      return null;
    }
  }

  return {
    async battle({ bundle, lb, t, subtitle }) {
      try {
        const svg = battleCard({
          title: bundle.event.name,
          subtitle,
          teams: lb.teams.map((team) => ({ ...team, name: team.name })),
          labels: {
            points: t("board.points"),
            builds: t("board.builds"),
            area: t("board.area"),
            participants: t("board.participants"),
          },
          progress: eventProgress(bundle.event),
          number: t.number,
        });
        return await rasterize(svg);
      } catch (err) {
        log?.warn("Battle card could not be rendered:", err.message);
        return null;
      }
    },

    async profile({ bundle, data, user, t }) {
      try {
        const { participant, player, averages } = data;
        const team = bundle.team(participant.teamId);
        const s = bundle.scoring;
        const svg = profileCard({
          name: participant.minecraftName,
          teamName: team ? team.name : t("common.noTeam"),
          teamColor: team?.color,
          avatar: await avatarDataUri(user?.avatarUrl),
          rankText: player?.rank ? t("profile.rankValue", { rank: player.rank, total: player.of }) : t("profile.unranked"),
          points: player?.points ?? 0,
          pointsLabel: t("profile.points"),
          bars: [
            { label: t("categories.base"), value: averages?.basePoints ?? 0, max: Math.max(...s.baseOptions) },
            { label: t("categories.effort"), value: averages?.effort ?? 0, max: s.effortMax },
            { label: t("categories.detail"), value: averages?.detail ?? 0, max: s.detailMax },
          ],
          stats: [
            { label: t("profile.builds"), value: t.number(player?.builds ?? 0) },
            { label: t("profile.submitted"), value: t.number(player?.submitted ?? 0) },
            { label: t("profile.pending"), value: t.number(player?.pending ?? 0) },
            { label: t("profile.rejected"), value: t.number(player?.rejected ?? 0) },
            { label: t("profile.area"), value: `${t.number(player?.area ?? 0)} m²` },
          ],
          badge: player?.isJudge ? t("common.judgeBadge") : null,
          number: t.number,
        });
        return await rasterize(svg);
      } catch (err) {
        log?.warn("Profile card could not be rendered:", err.message);
        return null;
      }
    },
    teamLabel,
  };
}

module.exports = { createCardService };
