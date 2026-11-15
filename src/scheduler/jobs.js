// Recurring jobs, run once in the main thread (never per shard)
const { eventPhase } = require("../domain/eventWindow.js");
const { legacyWebhook } = require("../web/legacy.js");
const { replacer } = require("../core/json.js");

function createJobs({ services, log, now = () => new Date() }) {
  const { store, panels, settings } = services;

  return [
    {
      // Posts the start/end announcements and moves the event into ENDED
      name: "event-lifecycle",
      intervalMs: 60_000,
      async run() {
        const running = await store.listEventsByStatus(["RUNNING"]);
        for (const event of running) {
          const phase = eventPhase(event, now());
          if (phase === "running" && !event.startAnnouncedAt) {
            await store.updateEvent(event.id, { startAnnouncedAt: now() });
            services.events.invalidate();
            await panels.announce(event.id, "start");
            log.info(`Event ${event.name}: start announced`);
          }
          if (phase === "ended" && !event.endAnnouncedAt) {
            await store.updateEvent(event.id, { endAnnouncedAt: now(), status: "ENDED" });
            services.events.invalidate();
            await panels.announce(event.id, "end");
            log.info(`Event ${event.name}: building phase closed`);
          }
        }
      },
    },
    {
      name: "battle-boards",
      intervalMs: 60_000,
      lastRun: 0,
      async run() {
        const { boardIntervalMinutes } = await settings.get();
        if (Date.now() - this.lastRun < boardIntervalMinutes * 60_000 - 1000) return;
        this.lastRun = Date.now();
        const active = await store.listEventsByStatus(["RUNNING", "ENDED"]);
        for (const event of active) await panels.updateBoards(event.id);
      },
    },
    {
      // Deletes personal data of finished events after the retention period
      // promised in the Privacy Policy (settings.legal.retentionMonths)
      name: "data-retention",
      intervalMs: 60 * 60_000,
      async run() {
        const { legal } = await settings.get();
        const cutoff = new Date(now());
        cutoff.setMonth(cutoff.getMonth() - legal.retentionMonths);
        for (const event of await store.listEventsByStatus(["ENDED", "ARCHIVED"])) {
          const end = event.endsAt || event.endAnnouncedAt || event.createdAt;
          if (new Date(end) > cutoff) continue;
          const { images } = await store.purgeEvent(event.id);
          await Promise.allSettled(images.map((url) => services.storage.remove(url)));
          if (images.length) log.info(`Event ${event.name}: personal data deleted after ${legal.retentionMonths} months`);
        }
      },
    },
    {
      // Same payload as the original WEBHOOK_URL feature, now configured in the dashboard
      name: "stats-webhook",
      intervalMs: 60_000,
      async run() {
        const { webhookUrl } = await settings.get();
        if (!webhookUrl) return;
        const bundle = await services.events.current();
        if (!bundle) return;
        const [participants, builds] = await Promise.all([
          store.listParticipants(bundle.event.id),
          store.listBuilds(bundle.event.id, { orderBy: "asc" }),
        ]);
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(legacyWebhook({ participants, builds }), replacer),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) log.warn(`Webhook answered HTTP ${res.status}`);
      },
    },
  ];
}

function startScheduler(jobs, log) {
  const timers = jobs.map((job) => {
    let running = false;
    const tick = async () => {
      if (running) return; // never overlap a slow run
      running = true;
      try {
        await job.run();
      } catch (err) {
        log.error(`Job ${job.name} failed:`, err.message);
      } finally {
        running = false;
      }
    };
    setTimeout(tick, 5_000).unref();
    return setInterval(tick, job.intervalMs);
  });
  return () => timers.forEach(clearInterval);
}

module.exports = { createJobs, startScheduler };
