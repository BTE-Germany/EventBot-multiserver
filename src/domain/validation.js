// Input validation shared by commands, message submissions and the dashboard
const MINECRAFT_NAME = /^[A-Za-z0-9_]{3,16}$/;
const LINK = /^https?:\/\/[^\s<>]+$/i;
const SNOWFLAKE = /^\d{17,20}$/;
const REFERENCE_TYPES = ["3d", "streetview", "images", "other"];

const isMinecraftName = (name) => typeof name === "string" && MINECRAFT_NAME.test(name.trim());
const isUrl = (link) => typeof link === "string" && LINK.test(link.trim());
const isSnowflake = (id) => SNOWFLAKE.test(String(id ?? ""));

function parseArea(input) {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : NaN;
}

// YouTube videos and imgur images/albums are accepted as build media.
// Returns { kind, url, ... } or null for any other link.
function classifyMedia(input) {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");

  let videoId = null;
  if (host === "youtu.be") videoId = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "music.youtube.com") {
    videoId = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] || null;
  }
  if (videoId !== null) {
    if (!/^[\w-]{11}$/.test(videoId)) return null;
    return {
      kind: "youtube",
      id: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }

  if (host === "i.imgur.com") {
    const match = url.pathname.match(/^\/(\w{5,10})\.(png|jpe?g|gif|webp)$/i);
    // Direct image: stored like an uploaded screenshot
    if (match) return { kind: "imgur-image", url: `https://i.imgur.com/${match[1]}.${match[2].toLowerCase()}`, name: `${match[1]}.${match[2].toLowerCase()}` };
    const video = url.pathname.match(/^\/(\w{5,10})\.(gifv|mp4)$/i);
    return video ? { kind: "imgur", url: `https://imgur.com/${video[1]}` } : null;
  }
  if (host === "imgur.com") {
    // Pages, albums and galleries are shown as links; site pages are not media
    const match = url.pathname.match(/^\/(?:(?:a|gallery|t\/\w+)\/)?(\w{5,10})\/?$/);
    if (!match || IMGUR_RESERVED.has(match[1].toLowerCase())) return null;
    return { kind: "imgur", url: `https://imgur.com${url.pathname.replace(/\/$/, "")}` };
  }
  return null;
}

const IMGUR_RESERVED = new Set(["upload", "signin", "register", "search", "about", "rules", "emotes", "privacy", "removalrequest", "account", "settings", "notifications", "user", "gallery", "random", "memegen", "vidgif", "apps", "tos", "jobs", "blog", "help"]);

const URLS = /https?:\/\/[^\s<>]+/gi;

// Free-form message submissions: "<coords> <reference link> 3d|street|... [youtube/imgur links]"
function parseMessageSubmission(content) {
  const text = String(content || "").trim();
  const urls = text.match(URLS) || [];
  // The reference is the first link that is not a YouTube/imgur media link
  const link = urls.find((u) => !classifyMedia(u)) ?? null;
  const media = urls.map(classifyMedia).filter(Boolean);
  let referenceType = "images";
  if (/\b3d\b/i.test(text)) referenceType = "3d";
  else if (/street/i.test(text)) referenceType = "streetview";
  const location = text.replace(URLS, "").replace(/\s+/g, " ").trim();
  const areaMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m²|m2|qm|sqm)/i);
  return {
    link,
    media,
    referenceType,
    location: location.slice(0, 200),
    area: areaMatch ? parseArea(areaMatch[1]) : null,
  };
}

// Splits media links into images to store and links to show as buttons
function splitMedia(links) {
  const parsed = links.map(classifyMedia);
  if (parsed.some((m) => !m)) return null;
  const unique = (list) => [...new Map(list.map((m) => [m.url, m])).values()];
  return {
    imageLinks: unique(parsed.filter((m) => m.kind === "imgur-image")),
    mediaLinks: unique(parsed.filter((m) => m.kind !== "imgur-image")).map((m) => m.url),
  };
}

const isImageAttachment = (a) =>
  a.contentType ? a.contentType.startsWith("image/") : /\.(png|jpe?g|gif|webp)$/i.test(a.name || "");

module.exports = {
  REFERENCE_TYPES,
  isMinecraftName,
  isUrl,
  isSnowflake,
  parseArea,
  parseMessageSubmission,
  classifyMedia,
  splitMedia,
  isImageAttachment,
};
