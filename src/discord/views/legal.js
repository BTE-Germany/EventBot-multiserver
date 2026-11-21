// Terms of Service dialog shown by /register, and the document reader
const { getDocument, paginate, toDiscord, legalVars } = require("../../legal/index.js");
const { truncate } = require("./format.js");

function documentVars(settings, env, t) {
  const vars = legalVars(settings.legal, { publicUrl: env.PUBLIC_URL });
  // Never show a raw placeholder if the hosting provider was not configured yet
  if (!vars.hostingProvider) vars.hostingProvider = t.locale.startsWith("de") ? "Unser Hosting-Anbieter" : "Our hosting provider";
  return vars;
}

function documentButtons(t) {
  return {
    type: 1,
    components: [
      { type: 2, style: 2, emoji: { name: "🔒" }, label: t("legal.privacy"), custom_id: "legal:doc:privacy" },
      { type: 2, style: 2, emoji: { name: "📜" }, label: t("legal.terms"), custom_id: "legal:doc:terms" },
      { type: 2, style: 2, emoji: { name: "ℹ️" }, label: t("legal.imprint"), custom_id: "legal:doc:imprint" },
    ],
  };
}

function consentDialog({ bundle, t, name, team, termsVersion, mode }) {
  const accept = `legal:accept:${termsVersion}:${mode === "reaccept" ? "-" : name}`;
  return {
    embeds: [
      {
        title: `📋 ${t("legal.title")}`,
        description: [
          mode === "reaccept" ? t("legal.reaccept") : t("legal.body", { event: bundle.event.name, name }),
          "",
          t("legal.readHint"),
          "",
          `> ${t("legal.confirm")}`,
        ].join("\n"),
        color: 0x5865f2,
        footer: { text: `${t("legal.terms")} · ${termsVersion}${team ? ` · ${team.name}` : ""}` },
      },
    ],
    components: [
      documentButtons(t),
      {
        type: 1,
        components: [
          { type: 2, style: 3, emoji: { name: "✅" }, label: t("legal.accept"), custom_id: accept },
          { type: 2, style: 4, label: t("legal.decline"), custom_id: "legal:decline" },
        ],
      },
    ],
  };
}

function documentPage({ doc, page = 0, t, settings, env }) {
  const document = getDocument(doc, t.locale, documentVars(settings, env, t));
  const pages = paginate(document.body);
  const current = Math.min(Math.max(0, page), pages.length - 1);
  const notes = [];
  if (!["de", "en"].includes(t.locale.split("-")[0])) notes.push(t("legal.languageNote"));
  const nav = { type: 1, components: [] };
  if (pages.length > 1) {
    nav.components.push(
      { type: 2, style: 2, emoji: { name: "⬅️" }, label: t("common.previous"), custom_id: `legal:page:${doc}:${current - 1}`, disabled: current === 0 },
      { type: 2, style: 2, emoji: { name: "➡️" }, label: t("common.next"), custom_id: `legal:page:${doc}:${current + 1}`, disabled: current >= pages.length - 1 }
    );
  }
  return {
    embeds: [
      {
        title: `${doc === "privacy" ? "🔒" : "📜"} ${document.title}`,
        description: truncate(toDiscord(pages[current]), 4096),
        color: 0x5865f2,
        footer: { text: [t("common.page", { page: current + 1, pages: pages.length }), ...notes].join(" · ").slice(0, 2048) },
      },
    ],
    components: nav.components.length ? [nav] : [],
  };
}

function imprintView({ t, settings }) {
  const l = settings.legal;
  const lines = [`**${l.operatorName}**`, ...l.operatorAddress.split(/,\s*/), "", l.operatorEmail ? `✉️ ${l.operatorEmail}` : null].filter((x) => x !== null);
  return {
    embeds: [{ title: `ℹ️ ${t("legal.imprint")}`, description: lines.join("\n"), color: 0x5865f2 }],
    components: [],
  };
}

function legalOverview({ t }) {
  return {
    embeds: [{ title: `📋 ${t("legal.privacy")} · ${t("legal.terms")} · ${t("legal.imprint")}`, description: t("legal.readHint"), color: 0x5865f2 }],
    components: [documentButtons(t)],
  };
}

module.exports = { consentDialog, documentPage, imprintView, legalOverview, documentButtons };
