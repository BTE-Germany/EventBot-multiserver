const { t, getUserLanguage } = require("../config/translations.js");

module.exports = {
  staffOnly: true,
  command: {
    name: "judge",
    description: "Rate a build",
    options: [
      {
        name: "id",
        description: "The ID of the build to judge",
        type: 4,
        required: true,
      },
      {
        name: "details",
        description: "Points for details",
        type: 4,
        choices: [
          { name: "1", value: 1 },
          { name: "2", value: 2 },
          { name: "3", value: 3 },
          { name: "4", value: 4 },
          { name: "5", value: 5 },
          { name: "6", value: 6 },
          { name: "7", value: 7 },
          { name: "8", value: 8 },
          { name: "9", value: 9 },
          { name: "10", value: 10 },
        ],
        required: true,
      },
      {
        name: "size",
        description: "Size of the build",
        type: 4,
        choices: [
          { name: "1", value: 1 },
          { name: "2", value: 2 },
          { name: "3", value: 3 },
          { name: "4", value: 4 },
          { name: "5", value: 5 },
          { name: "6", value: 6 },
          { name: "7", value: 7 },
          { name: "8", value: 8 },
          { name: "9", value: 9 },
          { name: "10", value: 10 },
        ],
        required: true,
      },
      {
        name: "difficulty",
        description: "Difficulty/complexity of the build",
        type: 4,
        choices: [
          { name: "1", value: 1 },
          { name: "2", value: 2 },
          { name: "3", value: 3 },
          { name: "4", value: 4 },
          { name: "5", value: 5 },
        ],
        required: true,
      },
      {
        name: "base_points",
        description: "Base points of the build",
        type: 5,
        required: false,
      },
      {
        name: "foreign_build",
        description: "Is this a foreign build?",
        type: 5,
        required: false,
      },
    ],
  },
  run: async (client, interaction, prisma) => {
    const lang = "en"; // Force English for judges
    
    if (
      interaction.member.roles.cache.some(
        (role) => role.id === process.env.PING_ROLE
      )
    ) {
      const build = await prisma.build.findUnique({
        where: {
          id: interaction.options.getInteger("id") || 0,
        },
      });
      if (!build) {
        await interaction.reply(t(lang, "build_not_found"));
      } else {
        if (build.judges.includes(interaction.member.user.id.toString())) {
          await interaction.reply(t(lang, "already_judged_build"));
          return;
        }
        const user = await prisma.user.findUnique({
          where: {
            id: build.builder_id,
          },
        });
        
        // Defer the reply to prevent interaction timeout
        await interaction.deferReply();
        
        if (build.judges?.length === 0) {
          const judges = [interaction.user.id.toString()];
          const base_points =
            typeof interaction.options.getBoolean("base_points") === "boolean"
              ? interaction.options.getBoolean("base_points")
              : true;
          const foreign_build =
            typeof interaction.options.getBoolean("foreign_build") === "boolean"
              ? interaction.options.getBoolean("foreign_build")
              : false;
          
          // Check if foreign build boost can be applied (once per day per user)
          let foreignBuildWarning = "";
          if (foreign_build) {
            const buildCreatedAt = new Date(build.created_timestamp);
            const oneDayBeforeBuildCreated = new Date(buildCreatedAt.getTime() - 24 * 60 * 60 * 1000);
            const lastForeignBuild = await prisma.build.findFirst({
              where: {
                builder_id: build.builder_id,
                foreign_build: true,
                created_timestamp: {
                  gte: oneDayBeforeBuildCreated,
                  lt: buildCreatedAt,
                },
                id: {
                  not: build.id,
                },
              },
              orderBy: {
                created_timestamp: 'desc',
              },
            });
            
            if (lastForeignBuild) {
              foreignBuildWarning = "\n⚠️ **Note:** This user already received a foreign build boost in the last 24 hours before this build was created. The multiplier will NOT be applied when the second judge rates this build.";
            }
          }
          
          await prisma.build.update({
            where: {
              id: interaction.options.getInteger("id"),
            },
            data: {
              judges: judges,
              A: interaction.options.getInteger("details"),
              B: interaction.options.getInteger("size"),
              C: interaction.options.getInteger("difficulty"),
              base_points: base_points,
              foreign_build: foreign_build,
            },
          });
          await interaction.editReply({
            content: t(lang, "build_judged_first", { id: interaction.options.getInteger("id") }) + foreignBuildWarning,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    label: t(lang, "back"),
                    style: 5,
                    url: `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${build.judge_msg}`,
                  },
                ],
              },
            ],
          });
          let embeds = [
            {
              title: `#${build.id.toString()}`,
              description: `Team: ${user.team_flag ? user.team_flag + ' ' : ''}\n${t(lang, "coordinates")}: ${build.location} \n ${t(lang, "base_points")}: ${base_points ? t(lang, "yes") : t(lang, "no")} \n ${t(lang, "foreign_build")}: ${foreign_build ? t(lang, "yes") : t(lang, "no")} \n ${t(lang, "judged_by")}: ${interaction.member.user.username}`,
              url: "https://bte-germany.de",
              color: 16761344,
              author: {
                name: `${user.minecraft_id}`,
              },
            },
          ];
          build.images.forEach((image) => {
            embeds.push({
              url: "https://bte-germany.de",
              image: {
                url: image,
              },
            });
          });
          await client.channels.cache
            .get(process.env.JUDGE_CHANNEL)
            .messages.fetch(build.judge_msg.toString())
            .then((message) => {
              message.edit({
                content: `<@&${process.env.PING_ROLE}>`,
                embeds: embeds,
              });
            });
          console.log(
            new Date().toLocaleString(),
            `Judge ${interaction.member.user.id} rated build ${build.id
            } as ${interaction.options.getInteger(
              "details"
            )}/${interaction.options.getInteger(
              "size"
            )}/${interaction.options.getInteger(
              "difficulty"
            )}. Base points: ${base_points}. 1/2 judges.`
          );
          return;
        }
        if (build.judges?.length === 1) {
          const judges = build.judges;
          judges.push(interaction.user.id.toString());
          await prisma.build.update({
            where: {
              id: interaction.options.getInteger("id"),
            },
            data: {
              judges: judges,
              A: (build.A + interaction.options.getInteger("details")) / 2,
              B: (build.B + interaction.options.getInteger("size")) / 2,
              C: (build.C + interaction.options.getInteger("difficulty")) / 2,
            },
          });
          const base_points = build.base_points ? 0 : -5;
          let pointsToAward =
            (build.A + interaction.options.getInteger("details")) / 2 +
            (build.B + interaction.options.getInteger("size")) / 2 +
            (build.C + interaction.options.getInteger("difficulty")) / 2 +
            base_points;

          // Apply foreign build multiplier if applicable (once per day per user)
          let foreignBuildApplied = false;
          if (build.foreign_build) {
            const buildCreatedAt = new Date(build.created_timestamp);
            const oneDayBeforeBuildCreated = new Date(buildCreatedAt.getTime() - 24 * 60 * 60 * 1000);
            
            // Check if user has already received foreign build boost in the 24 hours before this build was created
            const lastForeignBuild = await prisma.build.findFirst({
              where: {
                builder_id: build.builder_id,
                foreign_build: true,
                created_timestamp: {
                  gte: oneDayBeforeBuildCreated,
                  lt: buildCreatedAt,
                },
                id: {
                  not: build.id, // Exclude current build
                },
              },
              orderBy: {
                created_timestamp: 'desc',
              },
            });
            
            if (!lastForeignBuild) {
              // No foreign build in the 24 hours before this build was created, apply the multiplier
              const foreignBuildFactor = parseFloat(process.env.FOREIGN_BUILD_FACTOR || "1.0");
              pointsToAward = pointsToAward * foreignBuildFactor;
              foreignBuildApplied = true;
              
              console.log(
                new Date().toLocaleString(),
                `Foreign build multiplier (${foreignBuildFactor}x) applied for build ${build.id}`
              );
            } else {
              console.log(
                new Date().toLocaleString(),
                `Foreign build multiplier NOT applied for build ${build.id} - user ${build.builder_id} already received boost within 24 hours before build creation (Build #${lastForeignBuild.id} at ${lastForeignBuild.created_timestamp})`
              );
            }
          }

          // Check for active multiplier boosters
          const now = new Date();
          const allActiveMultipliers = await prisma.booster.findMany({
            where: {
              user_id: build.builder_id,
              type: "multiplier",
              activated: true,
            },
          });

          // Filter for truly active boosters (not expired by time or builds)
          const activeMultipliers = allActiveMultipliers.filter((b) => {
            // Check if expired by time
            if (b.expires_at && new Date(b.expires_at) <= now) {
              return false;
            }
            // Check if expired by build count
            if (b.max_builds !== null && b.builds_used >= b.max_builds) {
              return false;
            }
            return true;
          });

          const activeMultiplier = activeMultipliers.length > 0 ? activeMultipliers[0] : null;

          if (activeMultiplier) {
            pointsToAward = pointsToAward * activeMultiplier.value;
            
            // Increment builds_used for build-limited boosters
            if (activeMultiplier.max_builds !== null) {
              await prisma.booster.update({
                where: {
                  id: activeMultiplier.id,
                },
                data: {
                  builds_used: {
                    increment: 1,
                  },
                },
              });
            }
            
            console.log(
              new Date().toLocaleString(),
              `Booster multiplier (${activeMultiplier.value}x) applied for user ${build.builder_id} (builds_used: ${activeMultiplier.builds_used + 1}/${activeMultiplier.max_builds || 'unlimited'})`
            );
          }

          await prisma.user.update({
            where: {
              id: build.builder_id,
            },
            data: {
              points: user?.points + pointsToAward,
            },
          });
          
          // Create feedback message for the judge
          let feedbackMessage = t(lang, "build_judged_second", { id: interaction.options.getInteger("id") });
          if (build.foreign_build && !foreignBuildApplied) {
            feedbackMessage += "\n⚠️ **Foreign build multiplier was NOT applied** - this user already received a foreign build boost within the last 24 hours.";
          } else if (build.foreign_build && foreignBuildApplied) {
            const foreignBuildFactor = parseFloat(process.env.FOREIGN_BUILD_FACTOR || "1.0");
            feedbackMessage += `\n✅ **Foreign build multiplier (${foreignBuildFactor}x) was applied.**`;
          }
          
          await interaction.editReply({
            content: feedbackMessage,
            components: [
              {
              type: 1,
              components: [
                {
                type: 2,
                label: t(lang, "back"),
                style: 5,
                url: `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${build.judge_msg}`,
                },
              ],
              },
            ]
          });
          let embeds = [
            {
              title: `#${build.id.toString()}`,
              description: `Team: ${user.team_flag ? user.team_flag + ' ' : ''}\n${t(lang, "coordinates")}: ${build.location}`,
              url: "https://bte-germany.de",
              color: 7119627,
              author: {
                name: `${user.minecraft_id}`,
              },
              fields: [
                {
                  name: t(lang, "rating"),
                  value: `${t(lang, "details")}: ${(build.A + interaction.options.getInteger("details")) / 2
                    }\n${t(lang, "size")}: ${(build.B + interaction.options.getInteger("size")) / 2
                    }\n${t(lang, "difficulty")}: ${(build.C + interaction.options.getInteger("difficulty")) / 2
                    }\n${t(lang, "base_points")}: ${(build.base_points) ? t(lang, "yes") : t(lang, "no")
                    }\n${t(lang, "foreign_build")}: ${(build.foreign_build) ? t(lang, "yes") : t(lang, "no")
                    }`,
                },
              ],
            },
          ];
          build.images.forEach((image) => {
            embeds.push({
              url: "https://bte-germany.de",
              image: {
                url: image,
              },
            });
          });
          
          // Update message in all submission channels
          try {
            const submissionMessages = build.submission_messages || {};
            for (const [guildId, messageId] of Object.entries(submissionMessages)) {
              try {
                const serversConfig = JSON.parse(process.env.SERVERS_CONFIG || "{}");
                const config = serversConfig[guildId];
                if (!config) continue;
                
                const channel = await client.channels.fetch(config.submission);
                await channel.messages.fetch(messageId.toString())
                  .then((message) => {
                    message.edit({
                      content: " ",
                      embeds: embeds,
                    });
                  })
                  .catch(err => console.error(`Error updating message in guild ${guildId}:`, err));
              } catch (error) {
                console.error(`Error accessing submission channel for guild ${guildId}:`, error);
              }
            }
          } catch (e) {
            console.error("Error parsing SERVERS_CONFIG or updating submission messages:", e);
          }

            embeds[0].description += `\n ${t(lang, "judged_by")}: <@${build.judges[0]}> und <@${interaction.member.user.id}>`;
            await client.channels.cache
            .get(process.env.JUDGE_CHANNEL)
            .messages.fetch(build.judge_msg.toString())
            .then((message) => {
              message.edit({
                content: " ",
                embeds: embeds,
              });
            });
          console.log(
            new Date().toLocaleString(),
            `Judge ${interaction.member.user.id} rated build ${build.id
            } as ${interaction.options.getInteger(
              "details"
            )}/${interaction.options.getInteger("size")}/${interaction.options.getInteger("difficulty")}. 2/2 judges.`
          );
          return;
        }
        if (build.judges?.length > 1) {
          await interaction.editReply({
            content: t(lang, "build_already_judged")
          });
        }
      }
    } else {
      interaction.reply(t(lang, "not_judge"));
    }
  },
};
