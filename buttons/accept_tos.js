const teamsConfig = require("../config/teams.js");
const { t, languages } = require("../config/translations.js");

module.exports = {
  button: {
    name: "accept_tos_"
  },
  run: async (client, interaction, prisma) => {
    try {
      // Extract registration data from button customId
      const base64Data = interaction.customId.replace('accept_tos_', '');
      const registrationData = JSON.parse(
        Buffer.from(base64Data, 'base64').toString('utf-8')
      );

      const { minecraft, lang, userId, guildId, teamId } = registrationData;

      // Verify the user clicking is the same user who initiated registration
      if (interaction.user.id !== userId) {
        await interaction.reply({
          content: t(lang, "tos_not_for_you"),
          ephemeral: true,
        });
        return;
      }

      // Double-check if user is already registered
      const existingUser = await prisma.user.findUnique({
        where: {
          id: BigInt(userId),
        },
      });

      if (existingUser) {
        const team = teamsConfig.getTeamById(existingUser.team);
        await interaction.update({
          content: t(lang, "already_registered", {
            team: team?.name || "ein Team",
            flag: team?.flag || "",
          }),
          components: [],
        });
        return;
      }

      // Double-check if minecraft name is already taken
      const minecraftUser = await prisma.user.findFirst({
        where: {
          minecraft_id: minecraft,
        },
      });

      if (minecraftUser) {
        await interaction.update({
          content: t(lang, "minecraft_taken"),
          components: [],
        });
        return;
      }

      // Get team information
      const team = teamsConfig.getTeamById(teamId);

      if (!team) {
        await interaction.update({
          content: t(lang, "server_no_team"),
          components: [],
        });
        return;
      }

      // Create new user with team assignment and language
      await prisma.user.create({
        data: {
          minecraft_id: minecraft,
          id: BigInt(userId),
          team: team.id,
          team_flag: team.flag,
          guild_id: guildId,
          language: lang,
        },
      });

      await interaction.update({
        content: t(lang, "registration_success", {
          team: team.name,
          flag: team.flag,
        }),
        components: [],
      });

      console.log(
        new Date().toLocaleString(),
        `${interaction.user.tag} registered (${userId}) as ${minecraft} for Team ${team.name} in ${languages[lang]} (TOS accepted)`
      );
    } catch (e) {
      console.error(e);
      await interaction.reply({
        content: t(registrationData?.lang || 'en', "tos_registration_error"),
        ephemeral: true,
      });
    }
  }
};
