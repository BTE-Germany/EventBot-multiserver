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
    throw new Error("--ids is required. Example: --ids \"100-110,123,130-132\"");
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

function buildSubmissionEmbed(build, user) {
  const teamFlag = user?.team_flag ? ` ${user.team_flag}` : "";

  const embeds = [
    {
      title: `#${build.id}`,
      description: `Team:${teamFlag}\nCoordinates: ${build.location}`,
      url: "https://bte-germany.de",
      author: {
        name: `${user?.minecraft_id || build.builder_id.toString()}`,
      },
    },
  ];

  if (Array.isArray(build.images)) {
    for (const imageUrl of build.images.slice(0, 3)) {
      if (typeof imageUrl !== "string" || !imageUrl || imageUrl === "loading") {
        continue;
      }
      embeds.push({
        url: "https://bte-germany.de",
        image: {
          url: imageUrl,
        },
      });
    }
  }

  return embeds;
}

async function ensureBuildExists({ buildId, guildId, fallbackBuilderId, fallbackLocation }) {
  let build = await prisma.build.findUnique({
    where: { id: buildId },
  });

  if (build) {
    return { build, created: false };
  }

  if (!fallbackBuilderId) {
    throw new Error(
      `Build #${buildId} does not exist. Provide --builder to create missing builds.`
    );
  }

  build = await prisma.build.create({
    data: {
      id: buildId,
      builder_id: BigInt(fallbackBuilderId),
      message: null,
      submission_messages: {},
      judge_msg: null,
      location: `${fallbackLocation} #${buildId}`,
      images: [],
      judges: [],
      guild_id: guildId,
    },
  });

  return { build, created: true };
}

async function main() {
  const guildId = getArgValue("--guild", "-g");
  const idsRaw = getArgValue("--ids", "-i");
  const fallbackBuilderId = getArgValue("--builder", "-b");
  const fallbackLocation = getArgValue("--location", "-l") || "Recovered build";
  const dryRun = hasFlag("--dry-run", "-d");

  if (!guildId) {
    throw new Error("--guild is required. Example: --guild 123456789012345678");
  }

  const buildIds = parseBuildIds(idsRaw);

  let serversConfig;
  try {
    serversConfig = JSON.parse(process.env.SERVERS_CONFIG || "{}");
  } catch (error) {
    throw new Error(`SERVERS_CONFIG is invalid JSON: ${error.message}`);
  }

  const serverConfig = serversConfig[guildId];
  if (!serverConfig?.submission) {
    throw new Error(`No submission channel configured for guild ${guildId} in SERVERS_CONFIG`);
  }

  if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing in environment");
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  await client.login(process.env.BOT_TOKEN);
  await new Promise((resolve) => client.once("ready", resolve));

  const submissionChannel = await client.channels.fetch(serverConfig.submission);
  if (!submissionChannel || !submissionChannel.isTextBased()) {
    throw new Error(`Configured submission channel ${serverConfig.submission} is not text-based or not accessible`);
  }

  let createdCount = 0;
  let updatedCount = 0;

  console.log(`Processing ${buildIds.length} build IDs for guild ${guildId}...`);

  for (const buildId of buildIds) {
    const { build, created } = await ensureBuildExists({
      buildId,
      guildId,
      fallbackBuilderId,
      fallbackLocation,
    });

    const user = await prisma.user.findUnique({
      where: { id: build.builder_id },
    });

    const embeds = buildSubmissionEmbed(build, user);

    if (dryRun) {
      console.log(`[DRY RUN] Would post build #${build.id} to channel ${serverConfig.submission}`);
      continue;
    }

    const message = await submissionChannel.send({
      content: " ",
      embeds,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label: "Additional Information",
              custom_id: `info_${build.id}`,
              emoji: "📍",
            },
          ],
        },
      ],
    });

    const submissionMessages =
      build.submission_messages && typeof build.submission_messages === "object"
        ? { ...build.submission_messages }
        : {};

    submissionMessages[guildId] = message.id;

    const data = {
      submission_messages: submissionMessages,
    };

    if (build.guild_id === guildId || !build.message) {
      data.message = BigInt(message.id);
    }

    if (!build.guild_id) {
      data.guild_id = guildId;
    }

    await prisma.build.update({
      where: { id: build.id },
      data,
    });

    if (created) {
      createdCount += 1;
      console.log(`Created and posted build #${build.id}`);
    } else {
      updatedCount += 1;
      console.log(`Re-posted and synced build #${build.id}`);
    }
  }

  console.log(`Done. Created: ${createdCount}, Updated: ${updatedCount}, Total processed: ${buildIds.length}`);
  await client.destroy();
}

main()
  .catch((error) => {
    console.error("Recovery failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
