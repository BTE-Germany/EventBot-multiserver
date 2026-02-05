const teamsConfig = require("../config/teams.js");
const { t, languages } = require("../config/translations.js");

module.exports = {
  command: {
    name: "register",
    description: "Event registration / Event-Registrierung / Inscription à l'événement",
    options: [
      {
        name: "minecraft",
        description: "Your Minecraft name / Dein Minecraft-Name / Votre nom Minecraft",
        type: 3,
        required: true,
      },
      {
        name: "language",
        description: "Your preferred language / Deine Sprache / Votre langue",
        type: 3,
        required: true,
        choices: Object.entries(languages).map(([code, name]) => ({
          name: name,
          value: code,
        })),
      },
    ],
  },
  run: async (client, interaction, prisma) => {
    const selectedLang = interaction.options.getString("language") || "en";
    
    // Check if user is already registered on ANY server
    const existingUser = await prisma.user.findUnique({
      where: {
        id: BigInt(interaction.member.user.id),
      },
    });

    if (existingUser) {
      const team = teamsConfig.getTeamById(existingUser.team);
      await interaction.reply({
        content: t(selectedLang, "already_registered", {
          team: team?.name || "ein Team",
          flag: team?.flag || "",
        }),
        ephemeral: true,
      });
      return;
    }

    // Check if minecraft name is already taken
    const minecraftUser = await prisma.user.findFirst({
      where: {
        minecraft_id: interaction.options.getString("minecraft"),
      },
    });

    if (minecraftUser) {
      await interaction.reply({
        content: t(selectedLang, "minecraft_taken"),
        ephemeral: true,
      });
      return;
    }

    // Get team based on current guild
    const team = teamsConfig.getTeamByGuildId(interaction.guild.id);

    if (!team) {
      await interaction.reply({
        content: t(selectedLang, "server_no_team"),
        ephemeral: true,
      });
      return;
    }

    // Create new user with team assignment and language
    try {
      await prisma.user.create({
        data: {
          minecraft_id: interaction.options.getString("minecraft"),
          id: BigInt(interaction.member.user.id),
          team: team.id,
          team_flag: team.flag,
          guild_id: interaction.guild.id,
          language: selectedLang,
        },
      });

      await interaction.reply({
        content: t(selectedLang, "registration_success", {
          team: team.name,
          flag: team.flag,
        }),
        ephemeral: true,
      });

      console.log(
        new Date().toLocaleString(),
        `${interaction.member.user.tag} registered (${interaction.member.user.id}) as ${interaction.options.getString("minecraft")} for Team ${team.name} in ${languages[selectedLang]}`
      );
    } catch (e) {
      console.log(e);
      console.log("Error creating user.");
      await interaction.reply({
        content: t(selectedLang, "registration_error"),
        ephemeral: true,
      });
    }
  },
};
