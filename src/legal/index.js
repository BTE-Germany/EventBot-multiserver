// Privacy Policy and Terms of Service shipped with the bot. Users read them in
// Discord (paged messages, see discord/components/legal.js) or on the web
// (/legal/privacy, /legal/terms). German is the binding version; every other
// locale gets the English text.
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "documents");
const DOCUMENTS = ["privacy", "terms"];
const PAGE_LIMIT = 3800; // embed descriptions allow 4096 characters

const sources = {};
for (const doc of DOCUMENTS) {
  for (const lang of ["de", "en"]) sources[`${doc}.${lang}`] = fs.readFileSync(path.join(DIR, `${doc}.${lang}.md`), "utf8");
}

const documentLanguage = (locale) => (String(locale || "").toLowerCase().startsWith("de") ? "de" : "en");

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (match, key) => (vars[key] === undefined || vars[key] === "" ? match : String(vars[key])));
}

// Values for the placeholders, from the dashboard settings
function legalVars(legal, { publicUrl, botName = "EventBot" } = {}) {
  return {
    botName,
    publicUrl,
    version: legal.version,
    operatorName: legal.operatorName,
    operatorAddress: legal.operatorAddress,
    operatorEmail: legal.operatorEmail,
    hostingProvider: legal.hostingProvider,
    retentionMonths: legal.retentionMonths,
  };
}

function getDocument(doc, locale, vars) {
  if (!DOCUMENTS.includes(doc)) return null;
  const lang = documentLanguage(locale);
  const text = fill(sources[`${doc}.${lang}`], vars);
  const title = text.match(/^# (.+)$/m)?.[1] ?? doc;
  const body = text.replace(/^# .+\n+/, "").trim();
  return { doc, lang, title, body };
}

// Splits at "## " sections, then at paragraphs if a section is too long
function paginate(body, limit = PAGE_LIMIT) {
  const sections = body.split(/\n(?=## )/);
  const pages = [];
  let current = "";
  const push = (block) => {
    if (current && current.length + block.length + 2 > limit) {
      pages.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + block;
  };
  for (const section of sections) {
    if (section.length <= limit) {
      push(section);
      continue;
    }
    for (const paragraph of section.split(/\n\n+/)) {
      if (paragraph.length <= limit) push(paragraph);
      else for (const piece of hardSplit(paragraph, limit)) push(piece);
    }
  }
  if (current.trim()) pages.push(current.trim());
  return pages;
}

// Last resort for a single over-long paragraph: break at spaces
function hardSplit(text, limit) {
  const pieces = [];
  let rest = text;
  while (rest.length > limit) {
    const cut = rest.lastIndexOf(" ", limit);
    const at = cut > limit / 2 ? cut : limit;
    pieces.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

// Discord renders "## " headings, but inside embeds bold text reads better
const toDiscord = (page) => page.replace(/^## (.+)$/gm, "**$1**");

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Minimal Markdown → HTML for the web version (headings, lists, bold, code, line breaks)
function renderHtml({ title, body, lang }) {
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  const blocks = body.split(/\n\n+/).map((block) => {
    if (block.startsWith("## ")) return `<h2>${inline(block.slice(3))}</h2>`;
    const lines = block.split("\n");
    if (lines.every((l) => l.startsWith("- "))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`;
    // A bold heading line followed by a list
    if (lines.length > 1 && lines.slice(1).every((l) => l.startsWith("- "))) {
      return `<p>${inline(lines[0])}</p><ul>${lines.slice(1).map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`;
    }
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  });
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1d2330;--muted:#5b6475;--accent:#3b5bdb}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--fg:#e6e9ef;--muted:#9aa3b5;--accent:#91a7ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 16px 80px}
h1{font-size:2rem;margin:0 0 .5rem}h2{font-size:1.2rem;margin:2rem 0 .5rem}
a{color:var(--accent);overflow-wrap:anywhere}code{font-size:.9em}nav{margin-bottom:2rem;color:var(--muted)}
</style></head>
<body><main><nav><a href="?lang=de">Deutsch</a> · <a href="?lang=en">English</a></nav><h1>${esc(title)}</h1>
${blocks.join("\n")}
</main></body></html>`;
}

module.exports = { DOCUMENTS, getDocument, paginate, toDiscord, renderHtml, legalVars, documentLanguage, fill };
