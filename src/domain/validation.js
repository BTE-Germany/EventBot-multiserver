// Input validation shared by commands, message submissions and the dashboard
const MINECRAFT_NAME = /^[A-Za-z0-9_]{3,16}$/;
const URL = /^https?:\/\/[^\s<>]+$/i;
const SNOWFLAKE = /^\d{17,20}$/;
const REFERENCE_TYPES = ["3d", "streetview", "images", "other"];

const isMinecraftName = (name) => typeof name === "string" && MINECRAFT_NAME.test(name.trim());
const isUrl = (link) => typeof link === "string" && URL.test(link.trim());
const isSnowflake = (id) => SNOWFLAKE.test(String(id ?? ""));

function parseArea(input) {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : NaN;
}

// Free-form message submissions: "<coords> <link> 3d|street|..."
function parseMessageSubmission(content) {
  const text = String(content || "").trim();
  const link = text.match(/https?:\/\/[^\s<>]+/i)?.[0] ?? null;
  let referenceType = "images";
  if (/\b3d\b/i.test(text)) referenceType = "3d";
  else if (/street/i.test(text)) referenceType = "streetview";
  const location = (link ? text.replace(link, "") : text).replace(/\s+/g, " ").trim();
  const areaMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m²|m2|qm|sqm)/i);
  return {
    link,
    referenceType,
    location: location.slice(0, 200),
    area: areaMatch ? parseArea(areaMatch[1]) : null,
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
  isImageAttachment,
};
