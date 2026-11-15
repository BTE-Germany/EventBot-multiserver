const test = require("node:test");
const assert = require("node:assert/strict");
const { parseEnv, DEFAULT_OWNER_ID } = require("../src/config/env.js");
const { createSettingsService, DEFAULTS } = require("../src/config/settings.js");
const { createGuildConfigService } = require("../src/config/guildConfig.js");
const { createBus } = require("../src/core/bus.js");
const { createMemoryStore } = require("./helpers/memoryStore.js");

test(".env only needs the token and the database", () => {
  const env = parseEnv({ BOT_TOKEN: "x", DATABASE_URL: "postgresql://a" });
  assert.equal(env.PORT, 6969);
  assert.equal(env.OWNER_ID, DEFAULT_OWNER_ID);
  assert.equal(DEFAULT_OWNER_ID, "804386907244462141");
  assert.equal(env.PUBLIC_URL, "http://localhost:6969");
  assert.equal(env.SHARDS, "auto");
  assert.throws(() => parseEnv({ DATABASE_URL: "x" }), /BOT_TOKEN/);
  assert.equal(parseEnv({ BOT_TOKEN: "x", DATABASE_URL: "y", PUBLIC_URL: "https://bot.example.org/", SHARDS: "2" }).PUBLIC_URL, "https://bot.example.org");
});

test("settings have defaults, validate and stay cached until changed", async () => {
  const store = createMemoryStore();
  const settings = createSettingsService({ store });
  assert.deepEqual(await settings.get(), DEFAULTS);
  await settings.update({ webhookUrl: "https://hook.example.org" });
  assert.equal((await settings.get()).webhookUrl, "https://hook.example.org");
  await assert.rejects(settings.update({ admins: ["nope"] }));
  await assert.rejects(settings.update({ unknown: 1 }));
  const secret = await settings.sessionSecret();
  assert.ok(secret.length > 40);
  assert.equal(await settings.sessionSecret(), secret);
});

test("config changes reach other threads' caches through the bus", async () => {
  const store = createMemoryStore();
  const busA = createBus("test-bus");
  const busB = createBus("test-bus");
  try {
    const a = createGuildConfigService({ store, bus: busA });
    const b = createGuildConfigService({ store, bus: busB });
    await a.update("100000000000000001", { locale: "pl" });
    assert.equal((await b.get("100000000000000001")).locale, "pl");
    await a.update("100000000000000001", { locale: "de" });
    // BroadcastChannel delivers asynchronously
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await b.get("100000000000000001")).locale, "de");
    await assert.rejects(a.update("100000000000000001", { submissionChannelId: "abc" }));
  } finally {
    busA.close();
    busB.close();
  }
});
