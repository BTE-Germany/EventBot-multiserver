// Leaderboard, battle board, profile, builds list, help and wrap-up views
const { paginate } = require("../../domain/leaderboard.js");
const { eventPhase, eventProgress } = require("../../domain/eventWindow.js");
const { maxTotal } = require("../../domain/scoring.js");
const { teamLabel } = require("../../services/events.js");
const { bar, hexToInt, timestamp, rankLabel, truncate, statusLabel, messageLink } = require("./format.js");

const PAGE_SIZE = 10;

function rankingLines(entries, bundle, t, { showTeam = true } = {}) {
  return entries
    .map((p) => {
      const team = showTeam ? bundle.team(p.teamId) : null;
      const flag = team?.emoji ? `${team.emoji} ` : "";
      return `${rankLabel(p.rank)} ${flag}\`${p.minecraftName}\` · **${t("common.pointsValue", { value: t.number(p.points) })}** · ${t("common.buildsValue", { count: p.builds })}`;
    })
    .join("\n");
}

function phaseLine(event, t, now = new Date()) {
  const phase = eventPhase(event, now);
  if (phase === "upcoming") return `🗓️ ${t("phase.upcoming", { time: timestamp(event.startsAt) })}`;
  if (phase === "running") {
    return event.endsAt ? `🟢 ${t("phase.running", { time: timestamp(event.endsAt) })}` : `🟢 ${t("phase.runningOpen")}`;
  }
  return `⚪ ${t(`phase.${phase === "none" ? "draft" : phase}`)}`;
}

// Plain-text phase for images, where Discord timestamps don't render:
// "Ends in 3 days", localized via Intl.RelativeTimeFormat
function relativeTime(date, locale, now = new Date()) {
  const diff = new Date(date).getTime() - now.getTime();
  const units = [["day", 864e5], ["hour", 36e5], ["minute", 6e4]];
  const [unit, ms] = units.find(([, size]) => Math.abs(diff) >= size) || units[2];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(diff / ms), unit);
}

function phaseText(event, t, now = new Date()) {
  const phase = eventPhase(event, now);
  if (phase === "upcoming") return t("phase.upcoming", { time: relativeTime(event.startsAt, t.locale, now) });
  if (phase === "running") return event.endsAt ? t("phase.running", { time: relativeTime(event.endsAt, t.locale, now) }) : t("phase.runningOpen");
  return t(`phase.${phase === "none" ? "draft" : phase}`);
}

function leadLine(lb, t) {
  if (lb.draw) return `🤝 ${t("board.draw")}`;
  if (!lb.winner || lb.teams.length < 2) return null;
  const diff = lb.teams[0].points - lb.teams[1].points;
  return `🔥 ${t("board.leading", { team: `**${teamLabel(lb.winner)}**`, diff: t.number(diff) })}`;
}

function leaderboardPage({ bundle, lb, t, page = 0, teamId = null }) {
  const team = teamId ? lb.teams.find((x) => x.id === teamId) : null;
  const list = team ? team.ranking : lb.ranking;
  const { items, page: current, pages } = paginate(list, page, PAGE_SIZE);
  const embed = {
    title: `🏆 ${team ? `${teamLabel(team)} · ` : ""}${t("leaderboard.title", { event: bundle.event.name })}`,
    description: items.length ? rankingLines(items, bundle, t, { showTeam: !team }) : t("leaderboard.empty"),
    color: team ? hexToInt(team.color) : 0xf5a524,
    footer: { text: `${t("common.page", { page: current + 1, pages })} · ${t("leaderboard.footer")}` },
    ...(bundle.event.imageUrl ? { thumbnail: { url: bundle.event.imageUrl } } : {}),
  };
  const id = (p) => `lb:${bundle.event.id}:${p}:${teamId || "all"}`;
  const components =
    pages > 1
      ? [
          {
            type: 1,
            components: [
              { type: 2, style: 2, emoji: { name: "⬅️" }, label: t("common.previous"), custom_id: id(current - 1), disabled: current === 0 },
              { type: 2, style: 2, emoji: { name: "➡️" }, label: t("common.next"), custom_id: id(current + 1), disabled: current >= pages - 1 },
            ],
          },
        ]
      : [];
  return { embeds: [embed], components };
}

// The always-updated message in each server's leaderboard channel
function battleBoard({ bundle, lb, t, imageName = null, now = new Date() }) {
  const lines = [phaseLine(bundle.event, t, now), leadLine(lb, t)].filter(Boolean);
  const progress = eventProgress(bundle.event, now);
  if (progress !== null && progress < 1) lines.push(`\`${bar(progress, 1, 20)}\` ${Math.round(progress * 100)} %`);

  const battle = {
    title: `⚔️ ${bundle.event.name}`,
    description: lines.join("\n"),
    color: lb.winner ? hexToInt(lb.winner.color) : 0xf5a524,
    fields: lb.teams.map((team) => ({
      name: `${rankLabel(team.rank)} ${teamLabel(team)}`,
      value: [
        `**${t("common.pointsValue", { value: t.number(team.points) })}**`,
        `🏗️ ${t("common.buildsValue", { count: team.builds })}`,
        `📐 ${t("common.areaValue", { value: t.number(team.area) })}`,
        `👥 ${team.members}`,
      ].join("\n"),
      inline: true,
    })),
    ...(imageName ? { image: { url: `attachment://${imageName}` } } : {}),
    ...(bundle.event.imageUrl ? { thumbnail: { url: bundle.event.imageUrl } } : {}),
  };
  battle.fields.push({
    name: `⏳ ${t("board.waiting")}`,
    value: `**${lb.totals.pending}**`,
    inline: true,
  });

  const top = {
    title: `🏆 ${t("board.topBuilders")}`,
    description: lb.ranking.length ? rankingLines(lb.ranking.slice(0, PAGE_SIZE), bundle, t) : t("leaderboard.empty"),
    color: 0xf5a524,
    footer: { text: t("leaderboard.footer") },
    timestamp: now.toISOString(),
  };

  const buttons = [];
  if (lb.ranking.length > PAGE_SIZE) {
    buttons.push({ type: 2, style: 1, emoji: { name: "🏆" }, label: t("common.next"), custom_id: `lb:${bundle.event.id}:1:all` });
  }
  for (const team of lb.teams.slice(0, 4)) {
    buttons.push({
      type: 2,
      style: 2,
      label: truncate(team.name, 80),
      ...(team.emoji ? { emoji: emojiComponent(team.emoji) } : {}),
      custom_id: `lb:${bundle.event.id}:0:${team.id}`,
    });
  }
  return {
    embeds: [battle, top],
    components: buttons.length ? [{ type: 1, components: buttons }] : [],
    allowed_mentions: { parse: [] },
  };
}

// Custom emoji "<:name:id>" or a unicode emoji
function emojiComponent(emoji) {
  const custom = /^<a?:(\w+):(\d+)>$/.exec(emoji);
  return custom ? { name: custom[1], id: custom[2] } : { name: emoji };
}

function profileView({ bundle, player, participant, averages, best, allTime, t, user, imageName = null }) {
  const team = bundle.team(participant.teamId);
  const s = bundle.scoring;
  const fields = [
    {
      name: `🏅 ${t("profile.rank")}`,
      value: player?.rank ? t("profile.rankValue", { rank: player.rank, total: player.of }) : t("profile.unranked"),
      inline: true,
    },
    { name: `⭐ ${t("profile.points")}`, value: `**${t.number(player?.points ?? 0)}**`, inline: true },
    { name: `🏗️ ${t("profile.builds")}`, value: `**${player?.builds ?? 0}**`, inline: true },
    { name: `📨 ${t("profile.submitted")}`, value: String(player?.submitted ?? 0), inline: true },
    { name: `⏳ ${t("profile.pending")}`, value: String(player?.pending ?? 0), inline: true },
    { name: `❌ ${t("profile.rejected")}`, value: String(player?.rejected ?? 0), inline: true },
    { name: `📐 ${t("profile.area")}`, value: t("common.areaValue", { value: t.number(player?.area ?? 0) }), inline: true },
  ];
  if (averages) {
    fields.push({
      name: `📊 ${t("profile.averages")}`,
      value: [
        `\`${bar(averages.effort, s.effortMax)}\` **${t.number(averages.effort)}**/${t.number(s.effortMax)} · ${t("categories.effort")}`,
        `\`${bar(averages.detail, s.detailMax)}\` **${t.number(averages.detail)}**/${t.number(s.detailMax)} · ${t("categories.detail")}`,
      ].join("\n"),
    });
  }
  if (best) {
    fields.push({
      name: `🌟 ${t("profile.best")}`,
      value: `**#${best.id}** · ${t.number(best.total)}/${t.number(maxTotal(s))} · \`${truncate(best.location, 60)}\``,
    });
  }
  if (allTime && allTime.events > 1) {
    fields.push({
      name: `🗂️ ${t("profile.allTime")}`,
      value: t("profile.allTimeValue", { events: allTime.events, points: t.number(allTime.points), builds: allTime.builds }),
    });
  }
  return {
    embeds: [
      {
        author: { name: participant.minecraftName, ...(user?.avatarUrl ? { icon_url: user.avatarUrl } : {}) },
        title: `${team ? `${teamLabel(team)} · ` : ""}${t("profile.title", { name: participant.minecraftName })}`,
        color: hexToInt(team?.color),
        fields,
        ...(player?.isJudge && !player.eligible ? { footer: { text: `⚖️ ${t("profile.judgeNote")}` } } : {}),
        ...(imageName ? { image: { url: `attachment://${imageName}` } } : {}),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 2, emoji: { name: "🗂️" }, label: t("profile.buttonBuilds"), custom_id: `builds:${bundle.event.id}:${participant.userId}:0` },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

function buildsView({ bundle, participant, builds, t, page = 0, links = {} }) {
  const { items, page: current, pages } = paginate(builds, page, PAGE_SIZE);
  const description = items.length
    ? items
        .map((b) => {
          const link = links[b.id];
          const id = link ? `[**#${b.id}**](${link})` : `**#${b.id}**`;
          const score = b.status === "COMPLETE" ? ` · **${t("common.pointsValue", { value: t.number(b.total) })}**` : "";
          const reason = b.status === "REJECTED" && b.rejectReason ? `\n  ↳ *${truncate(b.rejectReason, 120)}*` : "";
          return `${id} ${statusLabel(b.status, t)}${score} · \`${truncate(b.location, 40)}\`${reason}`;
        })
        .join("\n")
    : t("builds.empty");
  const id = (p) => `builds:${bundle.event.id}:${participant.userId}:${p}`;
  return {
    embeds: [
      {
        title: `🗂️ ${t("builds.title", { name: participant.minecraftName })}`,
        description: truncate(description, 4000),
        color: hexToInt(bundle.team(participant.teamId)?.color),
        footer: { text: t("common.page", { page: current + 1, pages }) },
      },
    ],
    components:
      pages > 1
        ? [
            {
              type: 1,
              components: [
                { type: 2, style: 2, emoji: { name: "⬅️" }, label: t("common.previous"), custom_id: id(current - 1), disabled: current === 0 },
                { type: 2, style: 2, emoji: { name: "➡️" }, label: t("common.next"), custom_id: id(current + 1), disabled: current >= pages - 1 },
              ],
            },
          ]
        : [],
  };
}

function helpView({ bundle, t }) {
  const s = bundle.scoring;
  const fields = [];
  if (bundle.event.description) fields.push({ name: `📜 ${t("help.rules")}`, value: truncate(bundle.event.description, 1024) });
  fields.push({
    name: `⚖️ ${t("help.judgesTitle")}`,
    value: "`/judge` · `/reject` · `/unjudged` · `/correct` · `/delete` · `/refresh`",
  });
  return {
    embeds: [
      {
        title: `❓ ${t("help.title", { event: bundle.event.name })}`,
        description: [
          phaseLine(bundle.event, t),
          "",
          t("help.register"),
          t("help.submit"),
          t("help.judging", { base: t.number(Math.max(...s.baseOptions)), effort: t.number(s.effortMax), detail: t.number(s.detailMax) }),
          t("help.track"),
        ].join("\n"),
        color: 0x5865f2,
        fields,
        ...(bundle.event.imageUrl ? { thumbnail: { url: bundle.event.imageUrl } } : {}),
      },
    ],
  };
}

function announcementView({ bundle, kind, t }) {
  const isStart = kind === "start";
  return {
    embeds: [
      {
        title: t(isStart ? "announce.startTitle" : "announce.endTitle"),
        description: t(isStart ? "announce.startBody" : "announce.endBody", {
          event: bundle.event.name,
          end: bundle.event.endsAt ? timestamp(bundle.event.endsAt, "F") : "—",
        }),
        color: isStart ? 0x22c55e : 0xf5a524,
        ...(bundle.event.imageUrl ? { image: { url: bundle.event.imageUrl } } : {}),
      },
    ],
  };
}

function wrapupView({ bundle, lb, t, top = 3 }) {
  const place = (team) => team.location || team.name;
  const parts = (key) =>
    lb.teams.map((team) => t("wrapup.teamPart", {
      value: key === "area" ? t("common.areaValue", { value: t.number(team.area) }) : String(team.builds),
      place: place(team),
    }));
  const flagged = (p) => {
    const team = bundle.team(p.teamId);
    return `${team?.emoji ? `${team.emoji} ` : ""}\`${p.minecraftName}\` | ${t("common.pointsValue", { value: t.number(p.points) })} | ${t("common.buildsValue", { count: p.builds })}`;
  };
  const lines = [
    t("wrapup.intro", { event: bundle.event.name }),
    "",
    `📐 ${t("wrapup.totalArea", { total: t.number(lb.totals.area) })} (${parts("area").join(", ")})`,
    `🏗️ ${t("wrapup.totalBuilds", { total: lb.totals.builds })} (${parts("builds").join(", ")})`,
    "",
  ];
  if (lb.winner) lines.push(t("wrapup.winner", { points: t.number(lb.winner.points), team: teamLabel(lb.winner) }));
  else if (lb.draw) lines.push(t("wrapup.draw", { points: t.number(lb.teams[0].points) }));

  const fields = [
    {
      name: `🏆 ${t("wrapup.topOverall")}`,
      value: lb.ranking.slice(0, top).map((p) => `${rankLabel(p.rank)} ${flagged(p)}`).join("\n") || "—",
    },
    ...lb.teams.map((team) => ({
      name: t("wrapup.topTeam", { team: teamLabel(team) }),
      value:
        team.ranking
          .slice(0, top)
          .map((p) => `${rankLabel(p.rank)} \`${p.minecraftName}\` | ${t("common.pointsValue", { value: t.number(p.points) })} | ${t("common.buildsValue", { count: p.builds })}`)
          .join("\n") || "—",
    })),
  ];
  return {
    embeds: [
      {
        title: `🎉 ${t("wrapup.title", { event: bundle.event.name })}`,
        description: lines.join("\n"),
        color: lb.winner ? hexToInt(lb.winner.color) : 0xf5a524,
        fields,
        footer: { text: t("wrapup.thanks") },
        ...(bundle.event.imageUrl ? { thumbnail: { url: bundle.event.imageUrl } } : {}),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

module.exports = {
  PAGE_SIZE,
  rankingLines,
  phaseLine,
  phaseText,
  relativeTime,
  leaderboardPage,
  battleBoard,
  profileView,
  buildsView,
  helpView,
  announcementView,
  wrapupView,
  emojiComponent,
  messageLink,
};
