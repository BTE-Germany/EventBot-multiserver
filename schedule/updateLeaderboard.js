module.exports = {
  time: 300000,
  run: async (client, prisma) => {
    console.log(new Date().toLocaleString(), "Updating leaderboards...");

    const formatLeaderboard = (users) => {
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
    };
    
    // Parse servers config
    let serversConfig = {};
    try {
      serversConfig = JSON.parse(process.env.SERVERS_CONFIG || "{}");
    } catch (e) {
      console.error("Error parsing SERVERS_CONFIG:", e);
      return;
    }

    // Get all users globally
    let allUsers = await prisma.user.findMany();
    const builds = await prisma.build.findMany();

    // Prepare global leaderboard data (same for all servers)
    let globalUsers = allUsers.map((user) => {
      return {
        id: user.id.toString(),
        points: user.points,
        minecraft_id: user.minecraft_id,
        team_flag: user.team_flag || "",
        guild_id: user.guild_id,
      };
    });
    globalUsers = globalUsers.sort((a, b) => b.points - a.points).filter((user) => user.points > 0);

    // Calculate total points globally
    let totalPoints = 0;
    globalUsers.forEach((user) => {
      totalPoints = totalPoints + user.points;
    });

    // Update leaderboard for each server (global + regional data)
    for (const [guildId, config] of Object.entries(serversConfig)) {
      try {
        const regionalUsers = globalUsers.filter((user) => user.guild_id === guildId);
        const regionalPoints = regionalUsers.reduce((sum, user) => sum + user.points, 0);
        const regionalBuilds = builds.filter((build) => build.guild_id === guildId);

        await client.channels.cache
          .get(config.leaderboard_channel)
          .messages.fetch(config.leaderboard_message)
          .then(async (message) => {
            message.edit({
              content: null,
              embeds: [
                {
                  title: "Leaderboard",
                  description: `**Global**\n${formatLeaderboard(globalUsers)}\n\n**Regional**\n${formatLeaderboard(regionalUsers)}`,
                  color: 13697024,
                  fields: [
                    {
                      name: "Global Statistics",
                      value: `Total Builds: \`${builds.length}\`
                  Registered Builders: \`${globalUsers.length}\`
                  Total Points: \`${totalPoints}\``,
                      inline: true,
                    },
                    {
                      name: "Local Statistics",
                      value: `Total Builds: \`${regionalBuilds.length}\`
                  Registered Builders: \`${regionalUsers.length}\`
                  Total Points: \`${regionalPoints}\``,
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
                      label: `Next Page`,
                      custom_id: `leader-1`,
                      disabled: false,
                      emoji: {
                        name: `➡`,
                      },
                      type: 2,
                    },
                  ],
                },
              ],
            });
          });
        
        console.log(new Date().toLocaleString(), `Leaderboard für Guild ${guildId} aktualisiert`);
      } catch (error) {
        console.error(`Error updating leaderboard for guild ${guildId}:`, error);
      }
    }
  },
};
