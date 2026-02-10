const teamsConfig = require("../config/teams.js");
const { t, languages } = require("../config/translations.js");

module.exports = {
  button: {
    name: "accept_tos_"
  },
  run: async (client, interaction, prisma) => {
    try {
      // Extract data from button customId (format: accept_tos_MinecraftName,lang)
      const data = interaction.customId.replace('accept_tos_', '');
      const [minecraft, lang] = data.split(',');
      const userId = interaction.user.id;
      const guildId = interaction.guild.id;

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

      // Get team information from guild
      const team = teamsConfig.getTeamByGuildId(guildId);

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
      
      // Try to get language from error context or default to English
      let errorLang = 'en';
      try {
        const data = interaction.customId.replace('accept_tos_', '');
        errorLang = data.split(',')[1] || 'en';
      } catch {}
      
      await interaction.reply({
        content: t(errorLang, "tos_registration_error"),
        ephemeral: true,
      });
    }
  }
};
