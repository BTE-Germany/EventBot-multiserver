// SVG cards (team battle, player profile). Building the SVG is cheap and pure;
// rasterizing to PNG happens on the worker pool (see services/cards.js).
const FONT = "'Noto Sans', 'Noto Sans CJK SC', 'Noto Sans Thai', 'Noto Sans Devanagari', 'DejaVu Sans', sans-serif";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const safeColor = (c, fallback = "#5865F2") => (/^#[0-9a-fA-F]{6}$/.test(c || "") ? c : fallback);

// Keeps text inside its box without measuring fonts: a rough per-character budget
function fit(text, maxChars) {
  const s = String(text ?? "");
  return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
}

function frame(width, height, body, accent = "#F5A524") {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#151821"/><stop offset="1" stop-color="#0d0f14"/>
  </linearGradient>
  <linearGradient id="glow" x1="0" y1="0" x2="0.55" y2="1">
    <stop offset="0" stop-color="${accent}" stop-opacity="0.35"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="round"><rect width="${width}" height="${height}" rx="28"/></clipPath>
</defs>
<g clip-path="url(#round)" font-family="${FONT}">
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="6" fill="${accent}"/>
  <rect y="6" width="${width}" height="${height}" fill="url(#glow)" opacity="0.45"/>
  ${body}
</g>
</svg>`;
}

function meter(x, y, w, h, ratio, color, track = "#262a36") {
  const fill = Math.max(0, Math.round(w * clamp01(ratio)));
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${track}"/>` +
    (fill > 0 ? `<rect x="${x}" y="${y}" width="${Math.max(fill, h)}" height="${h}" rx="${h / 2}" fill="${color}"/>` : "");
}

/**
 * Team battle card.
 * @param {object} d
 * @param {string} d.title
 * @param {string} d.subtitle       phase line, already translated
 * @param {Array<{name,color,points,builds,area,members}>} d.teams  ranked
 * @param {object} d.labels         translated labels { points, builds, area, participants }
 * @param {number|null} d.progress  0..1 of the building phase
 * @param {(n:number)=>string} d.number  locale number formatting
 */
function battleCard({ title, subtitle, teams, labels, progress = null, number = String }) {
  const W = 1200;
  const H = 520;
  const pad = 56;
  const total = teams.reduce((s, t) => s + t.points, 0);
  const accent = safeColor(teams[0]?.color, "#F5A524");

  // Split bar: each team's share of all points
  let x = pad;
  const barW = W - pad * 2;
  let split = "";
  teams.forEach((team, i) => {
    const share = total > 0 ? team.points / total : 1 / Math.max(1, teams.length);
    const w = i === teams.length - 1 ? pad + barW - x : Math.round(barW * share);
    split += `<rect x="${x}" y="170" width="${Math.max(0, w)}" height="34" fill="${safeColor(team.color)}"/>`;
    if (w > 70) {
      split += `<text x="${x + w / 2}" y="194" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">${Math.round(share * 100)}%</text>`;
    }
    x += w;
  });

  const cols = Math.max(1, Math.min(teams.length, 4));
  const colW = barW / cols;
  const stats = teams
    .slice(0, 4)
    .map((team, i) => {
      const cx = pad + colW * i;
      const color = safeColor(team.color);
      const maxChars = Math.floor(colW / 17);
      return `
  <rect x="${cx + 4}" y="236" width="${colW - 8}" height="190" rx="18" fill="#1b1f2a" stroke="${color}" stroke-opacity="0.6"/>
  <circle cx="${cx + 32}" cy="270" r="9" fill="${color}"/>
  <text x="${cx + 50}" y="277" font-size="22" font-weight="700" fill="#fff">${esc(fit(team.name, maxChars))}</text>
  <text x="${cx + 24}" y="336" font-size="50" font-weight="800" fill="${color}">${esc(number(team.points))}</text>
  <text x="${cx + 24}" y="362" font-size="16" fill="#9aa3b5">${esc(fit(labels.points, maxChars + 6))}</text>
  <text x="${cx + 24}" y="398" font-size="18" fill="#d6dbe6">${esc(number(team.builds))} ${esc(fit(labels.builds, 14))}</text>
  <text x="${cx + 24}" y="416" font-size="14" fill="#9aa3b5">${esc(number(team.area))} m² · ${esc(number(team.members))} ${esc(fit(labels.participants, 14))}</text>`;
    })
    .join("");

  const timeline =
    progress === null
      ? ""
      : `${meter(pad, 464, barW, 10, progress, accent)}<text x="${W - pad}" y="498" font-size="16" fill="#9aa3b5" text-anchor="end">${Math.round(clamp01(progress) * 100)}%</text>`;

  const body = `
  <text x="${pad}" y="86" font-size="44" font-weight="800" fill="#fff">${esc(fit(title, 40))}</text>
  <text x="${pad}" y="126" font-size="22" fill="#b8c0d0">${esc(fit(subtitle, 80))}</text>
  <rect x="${pad}" y="170" width="${barW}" height="34" rx="17" fill="#262a36"/>
  <g clip-path="url(#splitclip)">${split}</g>
  <clipPath id="splitclip"><rect x="${pad}" y="170" width="${barW}" height="34" rx="17"/></clipPath>
  ${stats}
  ${timeline}`;
  return frame(W, H, body, accent);
}

/**
 * Player profile card.
 * @param {object} d
 * @param {string} d.name
 * @param {string} d.teamName
 * @param {string} d.teamColor
 * @param {string|null} d.avatar   data: URI (PNG) or null
 * @param {string} d.rankText      e.g. "#3 of 41", translated
 * @param {number} d.points
 * @param {Array<{label:string,value:number,max:number}>} d.bars   average scores
 * @param {Array<{label:string,value:string}>} d.stats             small stat tiles
 * @param {string|null} d.badge    e.g. "Judge"
 */
function profileCard({ name, teamName, teamColor, avatar, rankText, points, pointsLabel, bars = [], stats = [], badge = null, number = String }) {
  const W = 1100;
  const H = 400;
  const color = safeColor(teamColor);
  const avatarSvg = avatar
    ? `<clipPath id="av"><circle cx="130" cy="140" r="74"/></clipPath><image x="56" y="66" width="148" height="148" clip-path="url(#av)" xlink:href="${esc(avatar)}" href="${esc(avatar)}"/>`
    : `<circle cx="130" cy="140" r="74" fill="#262a36"/><text x="130" y="162" font-size="64" font-weight="800" fill="${color}" text-anchor="middle">${esc(String(name || "?").slice(0, 1).toUpperCase())}</text>`;

  const barRows = bars
    .map((b, i) => {
      const y = 108 + i * 64;
      return `
  <text x="560" y="${y}" font-size="18" fill="#b8c0d0">${esc(fit(b.label, 34))}</text>
  <text x="1040" y="${y}" font-size="18" font-weight="700" fill="#fff" text-anchor="end">${esc(number(b.value))} / ${esc(number(b.max))}</text>
  ${meter(560, y + 12, 480, 14, b.max > 0 ? b.value / b.max : 0, color)}`;
    })
    .join("");

  const tiles = stats
    .slice(0, 5)
    .map((s, i) => {
      const x = 56 + i * 202;
      return `
  <rect x="${x}" y="276" width="186" height="88" rx="16" fill="#1b1f2a"/>
  <text x="${x + 18}" y="318" font-size="28" font-weight="800" fill="#fff">${esc(fit(s.value, 10))}</text>
  <text x="${x + 18}" y="346" font-size="15" fill="#9aa3b5">${esc(fit(s.label, 20))}</text>`;
    })
    .join("");

  const body = `
  <circle cx="130" cy="140" r="80" fill="${color}"/>
  ${avatarSvg}
  <text x="236" y="112" font-size="40" font-weight="800" fill="#fff">${esc(fit(name, 16))}</text>
  <rect x="236" y="128" width="${Math.min(300, 30 + String(teamName).length * 11)}" height="32" rx="16" fill="${color}" fill-opacity="0.2" stroke="${color}"/>
  <text x="252" y="150" font-size="17" font-weight="700" fill="${color}">${esc(fit(teamName, 24))}</text>
  <text x="236" y="214" font-size="44" font-weight="800" fill="${color}">${esc(number(points))}</text>
  <text x="236" y="242" font-size="17" fill="#9aa3b5">${esc(fit(`${pointsLabel} · ${rankText}`, 34))}</text>
  ${badge ? `<rect x="400" y="186" width="${30 + String(badge).length * 10}" height="30" rx="15" fill="#3b82f6" fill-opacity="0.25"/><text x="415" y="207" font-size="15" font-weight="700" fill="#93c5fd">${esc(fit(badge, 14))}</text>` : ""}
  ${barRows}
  ${tiles}`;
  return frame(W, H, body, color);
}

module.exports = { battleCard, profileCard, esc, fit };
