// Wires all services together. Called once per thread: in the main thread
// (dashboard, API, scheduler) and in every shard worker thread.
const { createLogger } = require("./core/logger.js");
const { getBus } = require("./core/bus.js");
const { WorkerPool } = require("./core/workerPool.js");
const { createStore } = require("./db/store.js");
const { createSettingsService } = require("./config/settings.js");
const { createGuildConfigService } = require("./config/guildConfig.js");
const { createEventService } = require("./services/events.js");
const { createAccessService } = require("./services/access.js");
const { createStatsService } = require("./services/stats.js");
const { createCardService } = require("./services/cards.js");
const { createStorageService, createImageService } = require("./services/storage.js");
const { createPanelService } = require("./services/panels.js");
const { createActionService } = require("./services/actions.js");

function createContainer({ env, rest, store = createStore(), bus = getBus(), pool, poolSize }) {
  const log = createLogger("app");
  pool ??= new WorkerPool({ size: poolSize ?? env.WORKER_THREADS });
  const settings = createSettingsService({ store, bus });
  const guildConfigs = createGuildConfigService({ store, bus });
  const events = createEventService({ store, bus });
  const access = createAccessService({ ownerId: env.OWNER_ID, settings });
  const stats = createStatsService({ store });
  const cards = createCardService({ pool, log: log.child("cards") });
  const storage = createStorageService({ connectionString: env.AZURE_STORAGE_CONNECTION_STRING, settings, log: log.child("storage") });
  const images = createImageService({ storage, pool, log: log.child("images") });
  const panels = createPanelService({ rest, store, events, guildConfigs, settings, stats, cards, log: log.child("panels") });
  const actions = createActionService({ store, panels, images, stats, access, settings, log: log.child("actions") });

  return {
    env,
    log,
    bus,
    pool,
    rest,
    store,
    settings,
    guildConfigs,
    events,
    access,
    stats,
    cards,
    storage,
    images,
    panels,
    actions,
    async close() {
      await pool.close();
      await store.disconnect();
    },
  };
}

module.exports = { createContainer };
