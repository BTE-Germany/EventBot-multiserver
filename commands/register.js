const teamsConfig = require("../config/teams.js");
const { t, languages } = require("../config/translations.js");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

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

    // Show TOS acceptance prompt (English only as specified)
    const minecraftName = interaction.options.getString("minecraft");
    const tosUrl = process.env.TOS_URL || "https://example.com/terms";
    const impressumUrl = process.env.IMPRESSUM_URL || "https://example.com/impressum";
    const privacyUrl = process.env.PRIVACY_POLICY_URL || "https://example.com/privacy";

    // Encode data in button customId (using base64 to handle special characters)
    const registrationData = Buffer.from(
      JSON.stringify({
        minecraft: minecraftName,
        lang: selectedLang,
        userId: interaction.member.user.id,
        guildId: interaction.guild.id,
        teamId: team.id
      })
    ).toString('base64');

    const acceptButton = new ButtonBuilder()
      .setCustomId(`accept_tos_${registrationData}`)
      .setLabel(t(selectedLang, "tos_accept_button"))
      .setStyle(ButtonStyle.Success);

    const declineButton = new ButtonBuilder()
      .setCustomId(`decline_tos_${selectedLang}`)
      .setLabel(t(selectedLang, "tos_decline_button"))
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder()
      .addComponents(acceptButton, declineButton);

    await interaction.reply({
      content: t(selectedLang, "tos_acceptance_title") + `\n\n` +
               `[${t(selectedLang, "tos_terms_link")}](${tosUrl})\n` +
               `[${t(selectedLang, "tos_impressum_link")}](${impressumUrl})\n` +
               `[${t(selectedLang, "tos_privacy_link")}](${privacyUrl})`,
      components: [row],
      ephemeral: true,
    });
  },
};
