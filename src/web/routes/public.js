// Public, unauthenticated endpoints
const { legacyLeaderboard } = require("../legacy.js");

module.exports = async function publicRoutes(app, { services }) {
  // Unchanged interface of the original bot. ?event=<id> optionally selects
  // an event; by default the running (or latest) event is used.
  app.get("/leaderboard", async (request) => {
    const eventId = Number(request.query?.event);
    const bundle = eventId ? await services.events.bundle(eventId) : await services.events.current();
    if (!bundle) return { users: [], builds: [], points: 0 };
    const [participants, builds] = await Promise.all([
      services.store.listParticipants(bundle.event.id),
      services.store.listBuilds(bundle.event.id, { orderBy: "asc" }),
    ]);
    return legacyLeaderboard({ participants, builds });
  });

  // Privacy Policy and Terms of Service, the same texts the bot shows in Discord
  app.get("/legal/:doc", async (request, reply) => {
    const { getDocument, renderHtml, legalVars, DOCUMENTS } = require("../../legal/index.js");
    if (!DOCUMENTS.includes(request.params.doc)) return reply.status(404).send({ error: "Not found" });
    const settings = await services.settings.get();
    const lang = request.query?.lang || String(request.headers["accept-language"] || "en").slice(0, 2);
    const vars = legalVars(settings.legal, { publicUrl: services.env.PUBLIC_URL });
    if (!vars.hostingProvider) vars.hostingProvider = lang.startsWith("de") ? "Unser Hosting-Anbieter" : "Our hosting provider";
    return reply.type("text/html; charset=utf-8").send(renderHtml(getDocument(request.params.doc, lang, vars)));
  });

  app.get("/health", async () => ({ ok: true, uptime: Math.round(process.uptime()) }));
};
