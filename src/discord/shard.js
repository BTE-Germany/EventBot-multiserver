// Entry point of each shard. ShardingManager starts one worker thread per
// shard (mode "worker"), so every shard has its own event loop, gateway
// connection, Prisma client and render pool.
const { Client, GatewayIntentBits, Events, Options } = require("discord.js");
const { getEnv } = require("../config/env.js");
const { createLogger } = require("../core/logger.js");
const { createContainer } = require("../container.js");
const { createRegistry } = require("./registry.js");

const env = getEnv();
const log = createLogger("shard");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  // The bot works through REST and the database; keep the caches small
  makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: 0, GuildMemberManager: 50 }),
});

// Each shard shares the CPU pool budget with the others
const services = createContainer({ env, rest: client.rest, poolSize: Math.max(1, Math.floor((env.WORKER_THREADS ?? 2) / 2)) });
const registry = createRegistry({ services, log });
const messageCreate = require("./events/messageCreate.js");

client.once(Events.ClientReady, (c) => {
  log.info(`Shard ${c.shard?.ids.join(",")} ready as ${c.user.tag} in ${c.guilds.cache.size} servers`);
});
client.on(Events.InteractionCreate, (interaction) => registry.dispatch(interaction));
client.on(Events.MessageCreate, (message) =>
  messageCreate.execute(message, services, log).catch((err) => log.error("messageCreate failed:", err))
);
// Remember server names for the dashboard
client.on(Events.GuildCreate, (guild) => services.store.upsertGuildConfig(guild.id, { name: guild.name }).catch(() => {}));
client.on(Events.Error, (err) => log.error("Client error:", err));

process.on("unhandledRejection", (err) => log.error("Unhandled rejection:", err));

client.login(env.BOT_TOKEN);
