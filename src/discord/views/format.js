// Formatting helpers shared by all views
const STATUS_STYLE = {
  PENDING: { emoji: "⏳", color: 0xf5a524 },
  IN_REVIEW: { emoji: "🔎", color: 0x3b82f6 },
  COMPLETE: { emoji: "✅", color: 0x22c55e },
  REJECTED: { emoji: "❌", color: 0xef4444 },
};
const MEDALS = ["🥇", "🥈", "🥉"];

function bar(value, max, width = 10) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

const hexToInt = (hex, fallback = 0x5865f2) => {
  const n = parseInt(String(hex || "").replace("#", ""), 16);
  return Number.isFinite(n) ? n : fallback;
};

const timestamp = (date, style = "R") => `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;

const messageLink = (guildId, channelId, messageId) =>
  `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;

const rankLabel = (rank) => MEDALS[rank - 1] || `\`#${rank}\``;

const truncate = (text, max) => {
  const s = String(text ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

const statusLabel = (status, t) => `${STATUS_STYLE[status]?.emoji || ""} ${t(`status.${status}`)}`.trim();

// "2 · Building"; only the default options 0/1/2 have a name
function baseLabel(points, t) {
  return [0, 1, 2].includes(points) ? `${t.number(points)} · ${t(`categories.base${points}`)}` : t.number(points);
}

const safeUrl = (url) => (/^https?:\/\//i.test(url || "") ? url : null);

module.exports = {
  STATUS_STYLE,
  bar,
  hexToInt,
  timestamp,
  messageLink,
  rankLabel,
  truncate,
  statusLabel,
  baseLabel,
  safeUrl,
};
