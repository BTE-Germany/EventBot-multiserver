require("dotenv").config();

module.exports = {
  staffOnly: true,
  command: {
    name: "delete",
    description: "Delete a build!",
    options: [
      {
        name: "id",
        description: "Die ID des zu löschenden Builds.",
        type: 4,
        required: true,
      },
      {
        name: "reason",
        description: "Der Grund für die Löschung des Builds.",
        type: 3,
        required: true,
      },
    ],
  },
  run: async (client, interaction, prisma) => {
    // Check if user has staff role
    if (
      !interaction.member.roles.cache.some(
        (role) => role.id === process.env.PING_ROLE
      )
    ) {
      return interaction.reply({
        content: "Du hast keine Berechtigung, diesen Befehl auszuführen!",
        ephemeral: true,
      });
    }

    // Parse servers config
    let serversConfig = {};
    try {
      serversConfig = JSON.parse(process.env.SERVERS_CONFIG || "{}");
    } catch (e) {
      console.error("Error parsing SERVERS_CONFIG:", e);
    }
    
    prisma.build
      .findUnique({
        where: {
          id: interaction.options.getInteger("id"),
        },
      })
      .then(async (build) => {
        if (!build) {
          await interaction.reply({
            content: "Dieses Build existiert nicht!",
            ephemeral: true,
          });
        } else {
          // Edit messages in all submission channels using tracked message IDs
          const submissionMessages = build.submission_messages || {};
          for (const [guildId, messageId] of Object.entries(submissionMessages)) {
            try {
              const config = serversConfig[guildId];
              if (!config) continue;
              
              const channel = await client.channels.fetch(config.submission);
              await channel.messages.fetch(messageId.toString())
                .then((msg) => msg.edit({ content: "Build deleted!", embeds: [] }))
                .catch(err => console.error(`Error editing submission message in guild ${guildId}:`, err));
            } catch (error) {
              console.error(`Error accessing submission channel for guild ${guildId}:`, error);
            }
          }
          
          if (build.judges.length < 2) {
            client.channels.cache
              .get(process.env.JUDGE_CHANNEL)
              .messages.fetch(build.judge_msg)
              .then((msg) => msg.edit({ content: "Build deleted!", embeds: [] }))
              .catch(err => console.error("Error editing judge message:", err));
            await prisma.build.delete({
              where: {
                id: interaction.options.getInteger("id"),
              },
            });
            await prisma.user
              .findUnique({
                where: {
                  id: build.builder_id,
                },
              })
              .then(async (user) => {
                await prisma.user.update({
                  where: {
                    id: build.builder_id,
                  },
                  data: {
                    points: user.points - 5,
                  },
                });
                await interaction.reply({
                  content:
                    "Build mit folgendem Grund gelöscht: " +
                    interaction.options.getString("reason"),
                });
                console.log(
                  new Date().toLocaleString(),
                  `Judge ${interaction.member.user.id} hat build ${build.id
                  } mit folgendem Grund gelöscht: ${interaction.options.getString("reason")}`
                );
              });
          } else {
            client.channels.cache
              .get(process.env.JUDGE_CHANNEL)
              .messages.fetch(build.judge_msg)
              .then((msg) => msg.edit({ content: "Build deleted!", embeds: [] }))
              .catch(err => console.error("Error editing judge message:", err));
            await prisma.build
              .delete({
                where: {
                  id: interaction.options.getInteger("id"),
                },
              })
              .then(async () => {
                await prisma.user
                  .findUnique({
                    where: {
                      id: build.builder_id,
                    },
                  })
                  .then(async (user) => {
                    let basepoints = build.base_points ? 5 : 0;
                    await prisma.user.update({
                      where: {
                        id: build.builder_id,
                      },
                      data: {
                        points: user.points - basepoints - build.A - build.B,
                      },
                    });
                  });
              });
            await interaction.reply({
              content:
                "Build mit folgendem Grund gelöscht: " +
                interaction.options.getString("reason"),
            });
          }
        }
      });
  },
};
