const { t, languages, getUserLanguage } = require("../config/translations.js");

module.exports = {
  command: {
    name: "language",
    description: "Change your language / Sprache ändern / Changer la langue",
    options: [
      {
        name: "new_language",
        description: "Select your new language / Wähle deine neue Sprache",
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
    const newLang = interaction.options.getString("new_language");
    const currentLang = await getUserLanguage(prisma, interaction.user.id);

    // Check if user is registered
    const user = await prisma.user.findUnique({
      where: {
        id: BigInt(interaction.user.id),
      },
    });

    if (!user) {
      await interaction.reply({
        content: t(currentLang, "not_registered"),
        ephemeral: true,
      });
      return;
    }

    // Update user's language
    await prisma.user.update({
      where: {
        id: BigInt(interaction.user.id),
      },
      data: {
        language: newLang,
      },
    });

    await interaction.reply({
      content: t(newLang, "language_updated", { language: languages[newLang] }),
      ephemeral: true,
    });

    console.log(
      new Date().toLocaleString(),
      `User ${interaction.user.id} changed language from ${currentLang} to ${newLang}`
    );
  },
};
