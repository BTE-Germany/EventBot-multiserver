require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { Client, GatewayIntentBits } = require("discord.js");

const prisma = new PrismaClient();

function getArgValue(flagLong, flagShort) {
  const args = process.argv.slice(2);
  const longIndex = args.indexOf(flagLong);
  if (longIndex !== -1 && args[longIndex + 1]) {
    return args[longIndex + 1];
  }

  const shortIndex = args.indexOf(flagShort);
  if (shortIndex !== -1 && args[shortIndex + 1]) {
    return args[shortIndex + 1];
  }

  return null;
}

function hasFlag(flagLong, flagShort) {
  const args = process.argv.slice(2);
  return args.includes(flagLong) || args.includes(flagShort);
}

function parseBuildIds(input) {
  if (!input || typeof input !== "string") {
    return null;
  }

  const ids = new Set();
  const segments = input
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (segment.includes("-")) {
      const [startRaw, endRaw] = segment.split("-").map((value) => value.trim());
      const start = Number.parseInt(startRaw, 10);
      const end = Number.parseInt(endRaw, 10);

      if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0) {
        throw new Error(`Invalid range segment: \"${segment}\"`);
      }

      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let id = low; id <= high; id += 1) {
        ids.add(id);
      }
    } else {
      const id = Number.parseInt(segment, 10);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`Invalid ID segment: \"${segment}\"`);
      }
      ids.add(id);
    }
  }

  return Array.from(ids).sort((a, b) => a - b);
}

function toWebpUrl(url, cdnHost) {
  if (typeof url !== "string" || !url) {
    return { changed: false, value: url };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { changed: false, value: url };
  }

  if (parsed.host !== cdnHost) {
    return { changed: false, value: url };
  }

  const extensionMatch = parsed.pathname.match(/\.(png|jpe?g|gif|bmp|tiff|webp)$/i);
  if (!extensionMatch) {
    return { changed: false, value: url };
  }

  if (extensionMatch[1].toLowerCase() === "webp") {
    return { changed: false, value: url };
  }

  parsed.pathname = parsed.pathname.replace(/\.(png|jpe?g|gif|bmp|tiff)$/i, ".webp");
  return { changed: true, value: parsed.toString() };
}

function patchEmbedUrls(embedJson, cdnHost) {
  let changed = false;
  const result = { ...embedJson };

  if (result.image?.url) {
    const next = toWebpUrl(result.image.url, cdnHost);
    if (next.changed) {
      result.image = { ...result.image, url: next.value };
      changed = true;
    }
  }

  if (result.thumbnail?.url) {
    const next = toWebpUrl(result.thumbnail.url, cdnHost);
    if (next.changed) {
      result.thumbnail = { ...result.thumbnail, url: next.value };
      changed = true;
    }
  }

  if (result.author?.icon_url) {
    const next = toWebpUrl(result.author.icon_url, cdnHost);
    if (next.changed) {
      result.author = { ...result.author, icon_url: next.value };
      changed = true;
    }
  }

  if (result.footer?.icon_url) {
    const next = toWebpUrl(result.footer.icon_url, cdnHost);
    if (next.changed) {
      result.footer = { ...result.footer, icon_url: next.value };
      changed = true;
    }
  }

  return { changed, embed: result };
}

async function updateMessageEmbeds({ message, cdnHost, dryRun, force }) {
  const currentEmbeds = message.embeds || [];
  if (currentEmbeds.length === 0) {
    return { changed: false, changedUrls: 0 };
  }

  let changedUrls = 0;
  const nextEmbeds = [];

  for (const embed of currentEmbeds) {
    const embedJson = embed.toJSON();
    const patched = patchEmbedUrls(embedJson, cdnHost);
    if (patched.changed) {
      changedUrls += 1;
    }
    nextEmbeds.push(patched.embed);
  }

  if (changedUrls === 0 && !force) {
    return { changed: false, changedUrls: 0 };
  }

  if (!dryRun) {
    await message.edit({
      embeds: nextEmbeds,
      components: message.components,
      content: message.content,
    });
  }

  return { changed: true, changedUrls };
}

async function main() {
  const idsRaw = getArgValue("--ids", "-i");
  const limitRaw = getArgValue("--limit", "-l");
  const dryRun = hasFlag("--dry-run", "-d");
  const force = hasFlag("--force", "-f");

  const targetIds = parseBuildIds(idsRaw);
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null;
  if (limitRaw && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }

  if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing in environment");
  }

  if (!process.env.CDN_URL) {
    throw new Error("CDN_URL is missing in environment");
  }

  if (!process.env.JUDGE_CHANNEL) {
    throw new Error("JUDGE_CHANNEL is missing in environment");
  }

  let serversConfig;
  try {
    serversConfig = JSON.parse(process.env.SERVERS_CONFIG || "{}");
  } catch (error) {
    throw new Error(`SERVERS_CONFIG is invalid JSON: ${error.message}`);
  }

  const cdnHost = new URL(process.env.CDN_URL).host;

  const where = targetIds ? { id: { in: targetIds } } : undefined;
  const builds = await prisma.build.findMany({
    where,
    orderBy: { id: "asc" },
    take: limit || undefined,
    select: {
      id: true,
      judge_msg: true,
      submission_messages: true,
      message: true,
      guild_id: true,
    },
  });

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(process.env.BOT_TOKEN);
  await new Promise((resolve) => client.once("ready", resolve));

  let scannedMessages = 0;
  let updatedMessages = 0;
  let failedMessages = 0;

  console.log(
    `Processing ${builds.length} builds (${dryRun ? "dry-run" : "apply"}${force ? ", force" : ""})...`
  );

  const judgeChannel = await client.channels.fetch(process.env.JUDGE_CHANNEL);
  if (!judgeChannel || !judgeChannel.isTextBased()) {
    throw new Error(`JUDGE_CHANNEL ${process.env.JUDGE_CHANNEL} is not accessible`);
  }

  for (const build of builds) {
    if (build.judge_msg) {
      scannedMessages += 1;
      try {
        const judgeMessage = await judgeChannel.messages.fetch(build.judge_msg.toString());
        const result = await updateMessageEmbeds({ message: judgeMessage, cdnHost, dryRun, force });
        if (result.changed) {
          updatedMessages += 1;
          console.log(`Build #${build.id}: updated judge embed URLs`);
        }
      } catch (error) {
        failedMessages += 1;
        console.error(`Build #${build.id}: judge message update failed - ${error.message}`);
      }
    }

    const submissionTargets = [];
    const mapped =
      build.submission_messages && typeof build.submission_messages === "object"
        ? build.submission_messages
        : {};

    for (const [guildId, messageId] of Object.entries(mapped)) {
      if (!guildId || !messageId) continue;
      submissionTargets.push({ guildId, messageId: messageId.toString() });
    }

    if (build.guild_id && build.message) {
      const hasLegacy = submissionTargets.some(
        (target) => target.guildId === build.guild_id && target.messageId === build.message.toString()
      );
      if (!hasLegacy) {
        submissionTargets.push({ guildId: build.guild_id, messageId: build.message.toString() });
      }
    }

    for (const target of submissionTargets) {
      scannedMessages += 1;
      const config = serversConfig[target.guildId];
      if (!config?.submission) {
        failedMessages += 1;
        console.error(
          `Build #${build.id}: missing submission channel config for guild ${target.guildId}`
        );
        continue;
      }

      try {
        const channel = await client.channels.fetch(config.submission);
        if (!channel || !channel.isTextBased()) {
          throw new Error(`Submission channel ${config.submission} not accessible`);
        }

        const message = await channel.messages.fetch(target.messageId);
        const result = await updateMessageEmbeds({ message, cdnHost, dryRun, force });
        if (result.changed) {
          updatedMessages += 1;
          console.log(`Build #${build.id}: updated submission embed URLs in guild ${target.guildId}`);
        }
      } catch (error) {
        failedMessages += 1;
        console.error(
          `Build #${build.id}: submission message ${target.messageId} update failed - ${error.message}`
        );
      }
    }
  }

  console.log("Embed URL update finished.");
  console.log(`Scanned messages: ${scannedMessages}`);
  console.log(`Updated messages: ${updatedMessages}`);
  console.log(`Failed messages: ${failedMessages}`);

  await client.destroy();
}

main()
  .catch((error) => {
    console.error("Embed URL update failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
