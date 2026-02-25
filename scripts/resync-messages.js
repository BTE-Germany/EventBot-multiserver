require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { Client, GatewayIntentBits } = require("discord.js");
const { t } = require("../config/translations");

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

function getImageEmbeds(build) {
  const embeds = [];
  const images = Array.isArray(build.images) ? build.images : [];

  for (const imageUrl of images.slice(0, 3)) {
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

  return embeds;
}

async function getJudgeNames(client, judges) {
  const names = [];
  for (const judgeId of judges) {
    try {
      const user = await client.users.fetch(judgeId.toString());
      names.push(user.username);
    } catch {
      names.push(judgeId.toString());
    }
  }
  return names;
}

function createSubmissionEmbeds(build, user) {
  const lang = "en";
  const teamPrefix = user?.team_flag ? ` ${user.team_flag}` : "";

  if ((build.judges || []).length >= 2) {
    return [
      {
        title: `#${build.id}`,
        description: `Team: ${user?.team_flag ? `${user.team_flag} ` : ""}\n${t(lang, "coordinates")}: ${build.location}`,
        url: "https://bte-germany.de",
        color: 7119627,
        author: {
          name: `${user?.minecraft_id || build.builder_id.toString()}`,
        },
        fields: [
          {
            name: t(lang, "rating"),
            value: `${t(lang, "details")}: ${build.A}\n${t(lang, "size")}: ${build.B}\n${t(lang, "difficulty")}: ${build.C}\n${t(lang, "base_points")}: ${build.base_points ? t(lang, "yes") : t(lang, "no")}\n${t(lang, "foreign_build")}: ${build.foreign_build ? t(lang, "yes") : t(lang, "no")}`,
          },
        ],
      },
      ...getImageEmbeds(build),
    ];
  }

  return [
    {
      title: `#${build.id}`,
      description: `Team:${teamPrefix}\nCoordinates: ${build.location}`,
      url: "https://bte-germany.de",
      author: {
        name: `${user?.minecraft_id || build.builder_id.toString()}`,
      },
    },
    ...getImageEmbeds(build),
  ];
}

async function createJudgeEmbeds(client, build, user) {
  const lang = "en";
  const judges = Array.isArray(build.judges) ? build.judges : [];

  if (judges.length === 0) {
    return [
      {
        title: `#${build.id}`,
        description: `Team:${user?.team_flag ? ` ${user.team_flag}` : ""}\nCoordinates: ${build.location}`,
        url: "https://bte-germany.de",
        author: {
          name: `${user?.minecraft_id || build.builder_id.toString()}`,
        },
      },
      ...getImageEmbeds(build),
    ];
  }

  if (judges.length === 1) {
    const judgeNames = await getJudgeNames(client, judges);
    return [
      {
        title: `#${build.id}`,
        description: `Team: ${user?.team_flag ? `${user.team_flag} ` : ""}\n${t(lang, "coordinates")}: ${build.location} \n ${t(lang, "base_points")}: ${build.base_points ? t(lang, "yes") : t(lang, "no")} \n ${t(lang, "foreign_build")}: ${build.foreign_build ? t(lang, "yes") : t(lang, "no")} \n ${t(lang, "judged_by")}: ${judgeNames[0]}`,
        url: "https://bte-germany.de",
        color: 16761344,
        author: {
          name: `${user?.minecraft_id || build.builder_id.toString()}`,
        },
      },
      ...getImageEmbeds(build),
    ];
  }

  const judgeMentions = judges.slice(0, 2).map((judgeId) => `<@${judgeId.toString()}>`).join(" und ");
  return [
    {
      title: `#${build.id}`,
      description: `Team: ${user?.team_flag ? `${user.team_flag} ` : ""}\n${t(lang, "coordinates")}: ${build.location}\n ${t(lang, "judged_by")}: ${judgeMentions}`,
      url: "https://bte-germany.de",
      color: 7119627,
      author: {
        name: `${user?.minecraft_id || build.builder_id.toString()}`,
      },
      fields: [
        {
          name: t(lang, "rating"),
          value: `${t(lang, "details")}: ${build.A}\n${t(lang, "size")}: ${build.B}\n${t(lang, "difficulty")}: ${build.C}\n${t(lang, "base_points")}: ${build.base_points ? t(lang, "yes") : t(lang, "no")}\n${t(lang, "foreign_build")}: ${build.foreign_build ? t(lang, "yes") : t(lang, "no")}`,
        },
      ],
    },
    ...getImageEmbeds(build),
  ];
}

function getSubmissionTargets(build) {
  const targets = [];

  const mapped =
    build.submission_messages && typeof build.submission_messages === "object"
      ? build.submission_messages
      : {};

  for (const [guildId, messageId] of Object.entries(mapped)) {
    if (!guildId || !messageId) continue;
    targets.push({ guildId, messageId: messageId.toString() });
  }

  if (build.guild_id && build.message) {
    const hasLegacy = targets.some(
      (target) =>
        target.guildId === build.guild_id &&
        target.messageId === build.message.toString()
    );
    if (!hasLegacy) {
      targets.push({ guildId: build.guild_id, messageId: build.message.toString() });
    }
  }

  return targets;
}

function formatLeaderboard(users) {
  if (users.length === 0) {
    return "No entries yet.";
  }

  const medals = [":first_place:", ":second_place:", ":third_place:"];

  return users
    .slice(0, 10)
    .map((user, index) => {
      const prefix = medals[index] || `${index + 1}.`;
      return `${prefix} ${user.team_flag || ""} \`${user.minecraft_id}\`  |  ${user.points} Points`;
    })
    .join("\n");
}

async function updateLeaderboards({ client, serversConfig, dryRun }) {
  const users = await prisma.user.findMany();
  const builds = await prisma.build.findMany();

  let globalUsers = users
    .map((user) => ({
      id: user.id.toString(),
      points: user.points,
      minecraft_id: user.minecraft_id,
      team_flag: user.team_flag || "",
      guild_id: user.guild_id,
    }))
    .sort((a, b) => b.points - a.points)
    .filter((user) => user.points > 0);

  const totalPoints = globalUsers.reduce((sum, user) => sum + user.points, 0);

  let scanned = 0;
  let updated = 0;
  let failed = 0;

  for (const [guildId, config] of Object.entries(serversConfig)) {
    if (!config?.leaderboard_channel || !config?.leaderboard_message) {
      continue;
    }

    scanned += 1;
    try {
      const channel = await client.channels.fetch(config.leaderboard_channel);
      if (!channel || !channel.isTextBased()) {
        throw new Error(`Leaderboard channel ${config.leaderboard_channel} not accessible`);
      }

      const regionalUsers = globalUsers.filter((user) => user.guild_id === guildId);
      const regionalPoints = regionalUsers.reduce((sum, user) => sum + user.points, 0);
      const regionalBuilds = builds.filter((build) => build.guild_id === guildId);

      if (!dryRun) {
        const message = await channel.messages.fetch(config.leaderboard_message.toString());
        await message.edit({
          content: null,
          embeds: [
            {
              title: "Leaderboard",
              description: `**Global**\n${formatLeaderboard(globalUsers)}\n\n**Regional**\n${formatLeaderboard(regionalUsers)}`,
              color: 13697024,
              fields: [
                {
                  name: "Global Statistics",
                  value: `Total Builds: \`${builds.length}\`\nRegistered Builders: \`${globalUsers.length}\`\nTotal Points: \`${totalPoints}\``,
                  inline: true,
                },
                {
                  name: "Local Statistics",
                  value: `Total Builds: \`${regionalBuilds.length}\`\nRegistered Builders: \`${regionalUsers.length}\`\nTotal Points: \`${regionalPoints}\``,
                  inline: true,
                },
              ],
              footer: {
                text: "Start today and fight your way to the top! Register with /register",
              },
              thumbnail: {
                url: process.env.EVENT_IMG,
              },
            },
          ],
          attachments: [],
          components: [
            {
              type: 1,
              components: [
                {
                  style: 3,
                  label: "Next Page",
                  custom_id: "leader-1",
                  disabled: false,
                  emoji: {
                    name: "➡",
                  },
                  type: 2,
                },
              ],
            },
          ],
        });
      }

      updated += 1;
      console.log(`Leaderboard updated for guild ${guildId}`);
    } catch (error) {
      failed += 1;
      console.error(`Leaderboard update failed for guild ${guildId}: ${error.message}`);
    }
  }

  return { scanned, updated, failed };
}

async function main() {
  const idsRaw = getArgValue("--ids", "-i");
  const limitRaw = getArgValue("--limit", "-l");
  const dryRun = hasFlag("--dry-run", "-d");
  const skipLeaderboards = hasFlag("--skip-leaderboards", "-s");

  const targetIds = parseBuildIds(idsRaw);
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null;
  if (limitRaw && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }

  if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing in environment");
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
      location: true,
      images: true,
      judges: true,
      A: true,
      B: true,
      C: true,
      base_points: true,
      foreign_build: true,
      builder_id: true,
    },
  });

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(process.env.BOT_TOKEN);
  await new Promise((resolve) => client.once("ready", resolve));

  const judgeChannel = await client.channels.fetch(process.env.JUDGE_CHANNEL);
  if (!judgeChannel || !judgeChannel.isTextBased()) {
    throw new Error(`JUDGE_CHANNEL ${process.env.JUDGE_CHANNEL} is not accessible`);
  }

  console.log(
    `Processing ${builds.length} builds (${dryRun ? "dry-run" : "apply"}${skipLeaderboards ? ", no-leaderboards" : ""})...`
  );

  let scannedMessages = 0;
  let updatedMessages = 0;
  let failedMessages = 0;

  for (const build of builds) {
    const user = await prisma.user.findUnique({
      where: {
        id: build.builder_id,
      },
    });

    if (build.judge_msg) {
      scannedMessages += 1;
      try {
        const judgeMessage = await judgeChannel.messages.fetch(build.judge_msg.toString());
        const judgeEmbeds = await createJudgeEmbeds(client, build, user);
        const judgeContent = (Array.isArray(build.judges) ? build.judges.length : 0) >= 2
          ? " "
          : `<@&${process.env.PING_ROLE}>`;

        if (!dryRun) {
          await judgeMessage.edit({
            content: judgeContent,
            embeds: judgeEmbeds,
          });
        }

        updatedMessages += 1;
      } catch (error) {
        failedMessages += 1;
        console.error(`Build #${build.id}: judge message update failed - ${error.message}`);
      }
    }

    const submissionTargets = getSubmissionTargets(build);
    const submissionEmbeds = createSubmissionEmbeds(build, user);

    for (const target of submissionTargets) {
      scannedMessages += 1;
      const config = serversConfig[target.guildId];

      if (!config?.submission) {
        failedMessages += 1;
        console.error(`Build #${build.id}: missing submission channel for guild ${target.guildId}`);
        continue;
      }

      try {
        const channel = await client.channels.fetch(config.submission);
        if (!channel || !channel.isTextBased()) {
          throw new Error(`Submission channel ${config.submission} not accessible`);
        }

        const message = await channel.messages.fetch(target.messageId.toString());
        if (!dryRun) {
          await message.edit({
            content: " ",
            embeds: submissionEmbeds,
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
        }

        updatedMessages += 1;
      } catch (error) {
        failedMessages += 1;
        console.error(
          `Build #${build.id}: submission message ${target.messageId} update failed - ${error.message}`
        );
      }
    }
  }

  let leaderboardStats = { scanned: 0, updated: 0, failed: 0 };
  if (!skipLeaderboards) {
    leaderboardStats = await updateLeaderboards({
      client,
      serversConfig,
      dryRun,
    });
  }

  console.log("Message re-sync finished.");
  console.log(`Build messages scanned: ${scannedMessages}`);
  console.log(`Build messages updated: ${updatedMessages}`);
  console.log(`Build message failures: ${failedMessages}`);
  if (!skipLeaderboards) {
    console.log(`Leaderboards scanned: ${leaderboardStats.scanned}`);
    console.log(`Leaderboards updated: ${leaderboardStats.updated}`);
    console.log(`Leaderboard failures: ${leaderboardStats.failed}`);
  }

  await client.destroy();
}

main()
  .catch((error) => {
    console.error("Message re-sync failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
