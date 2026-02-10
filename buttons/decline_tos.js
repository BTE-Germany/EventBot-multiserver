const { t } = require("../config/translations.js");

module.exports = {
  button: {
    name: "decline_tos"
  },
  run: async (client, interaction, prisma) => {
    // Extract language from button customId (format: decline_tos_en)
    const lang = interaction.customId.split('_')[2] || 'en';
    
    await interaction.update({
      content: t(lang, "tos_declined"),
      components: [],
    });

    console.log(
      new Date().toLocaleString(),
      `${interaction.user.tag} (${interaction.user.id}) declined TOS during registration`
    );
  }
};
