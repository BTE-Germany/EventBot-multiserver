const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer, COOKIE } = require("../src/web/server.js");
const { createLoginToken } = require("../src/web/auth.js");
const { createSettingsService } = require("../src/config/settings.js");
const { createGuildConfigService } = require("../src/config/guildConfig.js");
const { createAccessService } = require("../src/services/access.js");
const { createLogger } = require("../src/core/logger.js");
const { IDS, TERMS, seedBattle, user, attachment } = require("./helpers/fixtures.js");

// The original bot's response: GET /leaderboard → { users, builds, points }
const LEGACY_USER_KEYS = ["banned", "id", "minecraft_id", "points"];
const LEGACY_BUILD_KEYS = [
  "A", "B", "base_points", "builder_id", "created_timestamp", "id", "images", "judge_msg",
  "judges", "location", "message", "reference_link", "reference_type",
];

async function setup() {
  const ctx = await seedBattle();
  const settings = createSettingsService({ store: ctx.store });
  const services = {
    env: { PUBLIC_URL: "http://localhost:6969", OWNER_ID: IDS.admin },
    log: createLogger("test"),
    store: ctx.store,
    events: ctx.events,
    stats: ctx.stats,
    actions: ctx.actions,
    settings,
    guildConfigs: createGuildConfigService({ store: ctx.store }),
    access: createAccessService({ ownerId: IDS.admin, settings }),
    pool: { info: () => ({ size: 0 }) },
    panels: { refresh: async () => ({ updated: 0 }), announce: async () => 2, updateBoards: async () => 2 },
    rest: { get: async () => [] },
    storage: { clear: async () => ({ deleted: 0 }) },
  };
  const app = await createServer({ services });
  return { ...ctx, app, services, settings };
}

async function login(env, userId = IDS.admin) {
  const token = createLoginToken(await env.settings.sessionSecret(), userId);
  const res = await env.app.inject({ method: "GET", url: `/auth/login?token=${encodeURIComponent(token)}` });
  const cookie = res.headers["set-cookie"];
  return { res, token, cookie: cookie ? cookie.split(";")[0] : null };
}

test("GET /leaderboard keeps the original response shape", async () => {
  const env = await setup();
  await env.actions.register({ acceptedTermsVersion: TERMS, bundle: env.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), minecraftName: "Anna" });
  await env.actions.register({ acceptedTermsVersion: TERMS, bundle: env.bundle, guildId: IDS.guildPL, user: user(IDS.builderPL), minecraftName: "Bartek" });
  const { build } = await env.actions.submit({
    bundle: env.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), location: "53.86, 10.68",
    referenceType: "streetview", referenceLink: "https://maps.google.com/x", attachments: [attachment()],
  });
  await env.store.addBuildMessage({ buildId: build.id, guildId: IDS.guildDE, channelId: "1", messageId: "111", kind: "public" });
  await env.store.addBuildMessage({ buildId: build.id, guildId: IDS.guildDE, channelId: "2", messageId: "222", kind: "judge" });
  for (const judge of [IDS.judgeDE, IDS.judgePL, IDS.judgeNeutral]) {
    await env.actions.vote({ bundle: env.bundle, buildId: build.id, user: user(judge), values: { basePoints: 2, effort: 4, detail: 6 } });
  }

  const res = await env.app.inject({ method: "GET", url: "/leaderboard", headers: { origin: "https://example.org" } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["access-control-allow-origin"], "https://example.org");
  const body = res.json();
  assert.deepEqual(Object.keys(body).sort(), ["builds", "points", "users"]);
  // Only builders with points, like before
  assert.equal(body.users.length, 1);
  assert.deepEqual(Object.keys(body.users[0]).sort(), LEGACY_USER_KEYS);
  assert.deepEqual(body.users[0], { id: IDS.builderDE, banned: false, minecraft_id: "Anna", points: 12 });
  assert.equal(body.points, 12);

  assert.equal(body.builds.length, 1);
  const b = body.builds[0];
  assert.deepEqual(Object.keys(b).sort(), LEGACY_BUILD_KEYS);
  assert.equal(b.A, 6); // technique & details
  assert.equal(b.B, 4); // effort
  assert.equal(b.base_points, 2);
  assert.equal(b.reference_type, "Streetview");
  assert.equal(b.message, "111");
  assert.equal(b.judge_msg, "222");
  assert.equal(b.builder_id, IDS.builderDE);
  assert.deepEqual(b.judges, [IDS.judgeDE, IDS.judgePL, IDS.judgeNeutral]);
  assert.ok(!Number.isNaN(Date.parse(b.created_timestamp)));
  for (const secret of ["judge_details", "extra_info", "extraInfo", "votes", "override"]) assert.ok(!(secret in b));

  const missing = await env.app.inject({ method: "GET", url: "/leaderboard?event=999" });
  assert.deepEqual(missing.json(), { users: [], builds: [], points: 0 });
});

test("dashboard requires a login; login links are single use", async () => {
  const env = await setup();
  assert.equal((await env.app.inject({ method: "GET", url: "/admin/api/overview" })).statusCode, 401);

  const { res, token, cookie } = await login(env);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, "/admin/");
  assert.match(res.headers["set-cookie"], /HttpOnly; SameSite=Strict/);
  assert.ok(cookie.startsWith(`${COOKIE}=`));

  const reused = await env.app.inject({ method: "GET", url: `/auth/login?token=${encodeURIComponent(token)}` });
  assert.equal(reused.statusCode, 401);

  const me = await env.app.inject({ method: "GET", url: "/admin/api/me", headers: { cookie } });
  assert.deepEqual(me.json(), { userId: IDS.admin, owner: true });
});

test("non-admins cannot log in, even with a valid signature", async () => {
  const env = await setup();
  const { res } = await login(env, IDS.builderDE);
  assert.equal(res.statusCode, 401);
});

test("admin writes need the CSRF header and validate input", async () => {
  const env = await setup();
  const { cookie } = await login(env);
  const noHeader = await env.app.inject({ method: "PUT", url: "/admin/api/settings", headers: { cookie }, payload: { webhookUrl: "" } });
  assert.equal(noHeader.statusCode, 403);

  const headers = { cookie, "x-requested-with": "dashboard" };
  const bad = await env.app.inject({ method: "PUT", url: "/admin/api/settings", headers, payload: { boardIntervalMinutes: 0 } });
  assert.equal(bad.statusCode, 400);
  const ok = await env.app.inject({ method: "PUT", url: "/admin/api/settings", headers, payload: { boardIntervalMinutes: 10, admins: ["123456789012345678"] } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().boardIntervalMinutes, 10);

  // A second admin can work but not change the admin list
  const second = await login(env, "123456789012345678");
  const denied = await env.app.inject({
    method: "PUT", url: "/admin/api/settings",
    headers: { cookie: second.cookie, "x-requested-with": "dashboard" },
    payload: { admins: [] },
  });
  assert.equal(denied.statusCode, 403);
});

test("events can only start with one judge per team plus a neutral judge", async () => {
  const env = await setup();
  const { cookie } = await login(env);
  const headers = { cookie, "x-requested-with": "dashboard" };

  const created = await env.app.inject({ method: "POST", url: "/admin/api/events", headers, payload: { name: "Second battle" } });
  assert.equal(created.statusCode, 200);
  const eventId = created.json().id;
  assert.equal(created.json().scoring.effortMax, 6);
  await env.store.createTeam({ eventId, name: "A" });
  await env.store.createTeam({ eventId, name: "B" });
  env.events.invalidate();

  const detail = await env.app.inject({ method: "GET", url: `/admin/api/events/${eventId}`, headers });
  assert.equal(detail.json().coverage.required, 3);
  assert.equal(detail.json().coverage.ok, false);

  const start = await env.app.inject({ method: "PUT", url: `/admin/api/events/${eventId}`, headers, payload: { status: "RUNNING" } });
  assert.equal(start.statusCode, 409);
  assert.match(start.json().error, /At least 3 judges/);

  const existing = await env.app.inject({ method: "PUT", url: `/admin/api/events/${env.event.id}`, headers, payload: { status: "RUNNING" } });
  assert.equal(existing.statusCode, 200);
});

test("dashboard pages are served", async () => {
  const env = await setup();
  const res = await env.app.inject({ method: "GET", url: "/admin/" });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /text\/html/);
  const traversal = await env.app.inject({ method: "GET", url: "/admin/..%2F..%2Fconfig%2Fenv.js" });
  assert.ok(!traversal.body.includes("BOT_TOKEN"));
  assert.equal((await env.app.inject({ method: "GET", url: "/health" })).json().ok, true);
});

test("legal documents are served on the web", async () => {
  const env = await setup();
  const de = await env.app.inject({ method: "GET", url: "/legal/privacy?lang=de" });
  assert.equal(de.statusCode, 200);
  assert.match(de.body, /Datenschutzhinweise/);
  assert.match(de.body, /Unser Hosting-Anbieter/);
  const en = await env.app.inject({ method: "GET", url: "/legal/terms", headers: { "accept-language": "pl-PL" } });
  assert.match(en.body, /Terms of Service/);
  assert.equal((await env.app.inject({ method: "GET", url: "/legal/secrets" })).statusCode, 404);
});

test("GDPR erasure removes a participant with all builds", async () => {
  const env = await setup();
  env.services.panels.removeMessages = async () => {};
  env.services.storage.remove = async () => {};
  const { participant } = await env.actions.register({ acceptedTermsVersion: TERMS, bundle: env.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), minecraftName: "Anna" });
  await env.actions.submit({ bundle: env.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), location: "x", referenceType: "3d", referenceLink: "https://x.y", attachments: [attachment()] });
  const { cookie } = await login(env);
  const headers = { cookie, "x-requested-with": "dashboard" };
  assert.equal((await env.app.inject({ method: "DELETE", url: `/admin/api/participants/${participant.id}`, headers, payload: {} })).statusCode, 400);
  const res = await env.app.inject({ method: "DELETE", url: `/admin/api/participants/${participant.id}`, headers, payload: { reason: "Art. 17 request" } });
  assert.deepEqual(res.json(), { ok: true, builds: 1 });
  assert.equal(await env.store.findParticipant(env.event.id, IDS.builderDE), null);
  assert.equal(env.store.db.builds.length, 0);
  assert.ok(!env.store.db.activity.some((a) => String(a.userId) === IDS.builderDE), "no personal activity left");
});
