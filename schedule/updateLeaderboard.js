module.exports = {
  time: 300000,
  run: async (client, prisma) => {
    console.log(new Date().toLocaleString(), "Updating leaderboards...");
    
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
      };
    });
    globalUsers = globalUsers.sort((a, b) => b.points - a.points);

    // Calculate total points globally
    let totalPoints = 0;
    globalUsers.forEach((user) => {
      totalPoints = totalPoints + user.points;
    });

    // Update leaderboard for each server (all showing same global data)
    for (const [guildId, config] of Object.entries(serversConfig)) {
      try {

        await client.channels.cache
          .get(config.leaderboard_channel)
          .messages.fetch(config.leaderboard_message)
          .then(async (message) => {
            message.edit({
              content: null,
              embeds: [
                {
                  title: "Leaderboard",
                  description: `
              :first_place: ${globalUsers[0]?.team_flag || ""} \`${globalUsers[0]?.minecraft_id}\`  |  ${globalUsers[0]?.points} Points \n
              :second_place: ${globalUsers[1]?.team_flag || ""} \`${globalUsers[1]?.minecraft_id}\`  |  ${globalUsers[1]?.points} Points \n
              :third_place: ${globalUsers[2]?.team_flag || ""} \`${globalUsers[2]?.minecraft_id}\`  |  ${globalUsers[2]?.points} Points \n
              4​. ${globalUsers[3]?.team_flag || ""} \`${globalUsers[3]?.minecraft_id}\`  |  ${globalUsers[3]?.points} Points \n
              5​. ${globalUsers[4]?.team_flag || ""} \`${globalUsers[4]?.minecraft_id}\`  |  ${globalUsers[4]?.points} Points \n
              6​. ${globalUsers[5]?.team_flag || ""} \`${globalUsers[5]?.minecraft_id}\`  |  ${globalUsers[5]?.points} Points \n
              7​. ${globalUsers[6]?.team_flag || ""} \`${globalUsers[6]?.minecraft_id}\`  |  ${globalUsers[6]?.points} Points \n
              8​. ${globalUsers[7]?.team_flag || ""} \`${globalUsers[7]?.minecraft_id}\`  |  ${globalUsers[7]?.points} Points \n
              9​. ${globalUsers[8]?.team_flag || ""} \`${globalUsers[8]?.minecraft_id}\`  |  ${globalUsers[8]?.points} Points \n
              10​. ${globalUsers[9]?.team_flag || ""} \`${globalUsers[9]?.minecraft_id}\`  |  ${globalUsers[9]?.points} Points`,
                  color: 13697024,
                  fields: [
                    {
                      name: "Statistics",
                      value: `Total Builds: \`${builds.length}\` \n
                  Registered Builders: \`${globalUsers.length}\` \n
                  Total Points: \`${totalPoints}\``,
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
