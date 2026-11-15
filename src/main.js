// Main thread: deploys the localized slash commands, starts one worker thread
// per shard, serves the dashboard and public API, and runs the scheduler.
const path = require("path");
const { ShardingManager, REST, Routes } = require("discord.js");
const { getEnv } = require("./config/env.js");
const { createLogger } = require("./core/logger.js");
const { createContainer } = require("./container.js");
const { createServer } = require("./web/server.js");
const { createJobs, startScheduler } = require("./scheduler/jobs.js");
const { loadCommands } = require("./discord/registry.js");

async function main() {
  const env = getEnv();
  const log = createLogger("main");
  const rest = new REST({ version: "10" }).setToken(env.BOT_TOKEN);
  const services = createContainer({ env, rest });

  // The signing secret is created on first start and kept in the database
  await services.settings.sessionSecret();

  const app = await rest.get(Routes.currentApplication());
  const commands = loadCommands().map((c) => c.json());
  await rest.put(Routes.applicationCommands(app.id), { body: commands });
  log.info(`Registered ${commands.length} commands: ${commands.map((c) => `/${c.name}`).join(" ")}`);

  const manager = new ShardingManager(path.join(__dirname, "discord/shard.js"), {
    token: env.BOT_TOKEN,
    totalShards: env.SHARDS,
    mode: "worker",
    respawn: true,
  });
  manager.on("shardCreate", (shard) => {
    log.info(`Shard ${shard.id} starting in a worker thread`);
    shard.on("death", () => log.warn(`Shard ${shard.id} died, respawning`));
  });

  const shardInfo = async () => {
    if (manager.shards.size === 0) return [];
    return manager.broadcastEval((c) => ({
      id: c.shard.ids[0],
      guilds: c.guilds.cache.size,
      ping: c.ws.ping,
      ready: c.isReady(),
      memory: process.memoryUsage().heapUsed,
    }), { timeout: 5000 });
  };

  const server = await createServer({ services, shardInfo });
  try {
    await server.listen({ port: env.PORT, host: "0.0.0.0" });
    log.info(`Dashboard: ${env.PUBLIC_URL}/admin/ · API: ${env.PUBLIC_URL}/leaderboard`);
  } catch (err) {
    // A busy port must not take the bot down with it
    log.error("HTTP server could not start:", err.message);
  }

  const stopJobs = startScheduler(createJobs({ services, log: log.child("jobs") }), log.child("jobs"));
  await manager.spawn({ timeout: 60_000 });

  const shutdown = async (signal) => {
    log.info(`${signal} received, shutting down`);
    stopJobs();
    await server.close().catch(() => {});
    for (const shard of manager.shards.values()) shard.kill();
    await services.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("unhandledRejection", (err) => log.error("Unhandled rejection:", err));
}

main().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
