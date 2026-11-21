// The panel shown for every build: public view in the builder's server,
// judge view (votes, notes, corrections) in every judge channel.
const { slotProgress, maxTotal } = require("../../domain/scoring.js");
const { slotLabel, teamLabel } = require("../../services/events.js");
const { STATUS_STYLE, bar, hexToInt, timestamp, truncate, statusLabel, baseLabel, safeUrl } = require("./format.js");
const { classifyMedia } = require("../../domain/validation.js");

const GALLERY_URL = "https://buildtheearth.net";
const MAX_GALLERY = 4;

function scoreLines(values, scoring, t) {
  const maxBase = Math.max(...scoring.baseOptions);
  return [
    `\`${bar(values.basePoints, maxBase)}\` **${t.number(values.basePoints)}**/${t.number(maxBase)} · ${t("categories.base")}`,
    `\`${bar(values.effort, scoring.effortMax)}\` **${t.number(values.effort)}**/${t.number(scoring.effortMax)} · ${t("categories.effort")}`,
    `\`${bar(values.detail, scoring.detailMax)}\` **${t.number(values.detail)}**/${t.number(scoring.detailMax)} · ${t("categories.detail")}`,
    `🏆 **${t("panel.total")}: ${t.number(values.total)} / ${t.number(maxTotal(scoring))}**`,
  ].join("\n");
}

function progressLines(bundle, build, t, judgeView) {
  return slotProgress(bundle.teams, build.votes || [])
    .map(({ slot, vote }) => {
      const label = slotLabel(bundle, slot, t);
      if (!vote) return `⏳ ${label} · *${t("panel.slotWaiting")}*`;
      if (!judgeView) return `✅ ${label}`;
      const scores = `${t("categories.baseShort")} ${t.number(vote.basePoints)} · ${t("categories.effortShort")} ${t.number(vote.effort)} · ${t("categories.detailShort")} ${t.number(vote.detail)}`;
      return `✅ ${label} · <@${vote.judgeId}> · ${scores}`;
    })
    .join("\n");
}

/**
 * @param {object} args
 * @param {object} args.bundle  decorated event bundle
 * @param {object} args.build   build with votes
 * @param {object} args.participant
 * @param {Function} args.t     translator
 * @param {"public"|"judge"} args.view
 */
function buildPanel({ bundle, build, participant, t, view = "public" }) {
  const judgeView = view === "judge";
  const { scoring } = bundle;
  const team = bundle.team(build.teamId);
  const style = STATUS_STYLE[build.status] || STATUS_STYLE.PENDING;
  const votes = build.votes || [];
  const reference = t.has(`reference.${build.referenceType}`) ? t(`reference.${build.referenceType}`) : build.referenceType;
  const link = safeUrl(build.referenceLink);

  const fields = [
    { name: t("panel.builder"), value: `\`${participant?.minecraftName ?? "?"}\`\n<@${build.builderId}>`, inline: true },
    { name: t("panel.team"), value: team ? teamLabel(team) : t("common.noTeam"), inline: true },
    { name: t("panel.reference"), value: link ? `[${reference}](${link})` : reference, inline: true },
    { name: `📍 ${t("panel.coordinates")}`, value: `\`${truncate(build.location, 200)}\``, inline: true },
  ];
  if (build.area) {
    fields.push({ name: `📐 ${t("panel.area")}`, value: t("common.areaValue", { value: t.number(build.area) }), inline: true });
  }

  if (build.status === "REJECTED") {
    fields.push({
      name: `❌ ${t("panel.rejected")}`,
      value: truncate(`${build.rejectReason || "—"}\n*${t("panel.rejectedHint")}*`, 1024),
    });
  } else {
    fields.push({ name: `⚖️ ${t("panel.progress")}`, value: truncate(progressLines(bundle, build, t, judgeView), 1024) });
    const showScore = build.status === "COMPLETE" || (judgeView && votes.length > 0);
    if (showScore) {
      fields.push({
        name: `📊 ${t("panel.score")}`,
        value: scoreLines({ basePoints: build.basePoints, effort: build.effort, detail: build.detail, total: build.total }, scoring, t),
      });
    }
  }

  if (judgeView && build.extraInfo) {
    fields.push({ name: `📝 ${t("panel.notes")}`, value: truncate(build.extraInfo, 1024) });
  }
  if (judgeView && build.override?.reason) {
    fields.push({
      name: "✏️",
      value: truncate(t("panel.correction", { user: `<@${build.override.by}>`, reason: build.override.reason }), 1024),
    });
  }

  const media = (build.media || []).map(classifyMedia).filter(Boolean);
  // Without screenshots, the first video's thumbnail is the picture
  const thumbnail = media.find((m) => m.kind === "youtube")?.thumbnail;
  const images = (build.images?.length ? build.images : thumbnail ? [thumbnail] : []).slice(0, MAX_GALLERY);
  const main = {
    title: `${judgeView ? "⚖️ " : "🏗️ "}${t("panel.title", { id: build.id })} · ${statusLabel(build.status, t)}`,
    url: GALLERY_URL,
    color: build.status === "PENDING" && team ? hexToInt(team.color) : style.color,
    fields,
    footer: { text: bundle.event.name },
    timestamp: new Date(build.createdAt).toISOString(),
    ...(images[0] ? { image: { url: images[0] } } : {}),
  };
  // Embeds sharing a url are rendered by Discord as one image gallery
  const embeds = [main, ...images.slice(1).map((url) => ({ url: GALLERY_URL, image: { url } }))];

  const buttons = [];
  if (judgeView) {
    buttons.push(
      { type: 2, style: 1, label: t("panel.buttonScore"), emoji: { name: "⚖️" }, custom_id: `build:score:${build.id}` },
      { type: 2, style: 4, label: t("panel.buttonReject"), emoji: { name: "✖️" }, custom_id: `build:reject:${build.id}` }
    );
  } else {
    buttons.push({ type: 2, style: 2, label: t("panel.buttonInfo"), emoji: { name: "📝" }, custom_id: `build:info:${build.id}` });
    if (build.status === "REJECTED") {
      buttons.push({ type: 2, style: 3, label: t("panel.buttonResubmit"), emoji: { name: "🔁" }, custom_id: `build:resubmit:${build.id}` });
    }
  }
  if (link) buttons.push({ type: 2, style: 5, label: t("panel.buttonReference"), emoji: { name: "🔗" }, url: link });

  // YouTube videos and imgur albums as link buttons (brand names, not translated)
  const mediaButtons = media.slice(0, 5).map((m, i) => ({
    type: 2,
    style: 5,
    label: `${m.kind === "youtube" ? "YouTube" : "imgur"}${media.length > 1 ? ` ${i + 1}` : ""}`,
    emoji: { name: m.kind === "youtube" ? "▶️" : "🖼️" },
    url: m.url,
  }));
  const components = [{ type: 1, components: buttons }];
  if (mediaButtons.length) components.push({ type: 1, components: mediaButtons });

  return { embeds, components, allowed_mentions: { parse: [] } };
}

module.exports = { buildPanel, scoreLines, progressLines };
