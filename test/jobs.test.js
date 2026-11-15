const test = require("node:test");
const assert = require("node:assert/strict");
const { createJobs } = require("../src/scheduler/jobs.js");
const { IDS, TERMS, seedBattle, user, attachment } = require("./helpers/fixtures.js");
const { createLogger } = require("../src/core/logger.js");

const job = (jobs, name) => jobs.find((j) => j.name === name);

async function setup(nowDate) {
  const ctx = await seedBattle();
  const calls = { announce: [], removed: [] };
  const services = {
    store: ctx.store,
    settings: ctx.settings,
    events: ctx.events,
    panels: { announce: async (id, kind) => calls.announce.push(kind), updateBoards: async () => 1 },
    storage: { remove: async (url) => calls.removed.push(url) },
  };
  const jobs = createJobs({ services, log: createLogger("test"), now: () => nowDate });
  return { ...ctx, jobs, calls };
}

test("start and end are announced once and the event closes itself", async () => {
  const running = await setup(new Date("2026-12-05T12:00:00Z"));
  await job(running.jobs, "event-lifecycle").run();
  await job(running.jobs, "event-lifecycle").run();
  assert.deepEqual(running.calls.announce, ["start"]);

  const over = await setup(new Date("2026-12-12T12:00:00Z"));
  await job(over.jobs, "event-lifecycle").run();
  assert.deepEqual(over.calls.announce, ["end"]);
  assert.equal((await over.store.getEvent(over.event.id)).status, "ENDED");
});

test("personal data is deleted after the retention period", async () => {
  const ctx = await setup(new Date("2027-12-12T20:00:00Z")); // 12 months + 1 day after the end
  await ctx.actions.register({ acceptedTermsVersion: TERMS, bundle: ctx.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), minecraftName: "Anna" });
  await ctx.actions.submit({ bundle: ctx.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), location: "x", referenceType: "3d", referenceLink: "https://x.y", attachments: [attachment(1)] });
  const retention = job(ctx.jobs, "data-retention");

  // Still running: nothing happens
  await retention.run();
  assert.equal(ctx.store.db.participants.length, 1);

  await ctx.store.updateEvent(ctx.event.id, { status: "ENDED" });
  await retention.run();
  assert.equal(ctx.store.db.participants.length, 0);
  assert.equal(ctx.store.db.builds.length, 0);
  assert.equal(ctx.store.db.judges.length, 0);
  assert.equal(ctx.store.db.activity.length, 0);
  assert.deepEqual(ctx.calls.removed, [attachment(1).url]);
  assert.ok(ctx.store.db.teams.length > 0, "event structure stays");
});

test("data within the retention period is kept", async () => {
  const ctx = await setup(new Date("2027-06-01T00:00:00Z"));
  await ctx.actions.register({ acceptedTermsVersion: TERMS, bundle: ctx.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), minecraftName: "Anna" });
  await ctx.store.updateEvent(ctx.event.id, { status: "ENDED" });
  await job(ctx.jobs, "data-retention").run();
  assert.equal(ctx.store.db.participants.length, 1);
});
