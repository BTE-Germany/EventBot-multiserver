const { t, getUserLanguage } = require("../config/translations.js");

module.exports = {
  command: {
    name: "boosters",
    description: "Show your available boosters / Zeige deine Booster / Afficher vos boosters",
  },
  run: async (client, interaction, prisma) => {
    const lang = await getUserLanguage(prisma, interaction.user.id);
    
    const user = await prisma.user.findUnique({
      where: {
        id: BigInt(interaction.user.id),
      },
      include: {
        boosters: true,
      },
    });

    if (!user) {
      await interaction.reply({
        content: t(lang, "not_registered"),
        ephemeral: true,
      });
      return;
    }

    const availableBoosters = user.boosters.filter((b) => !b.activated);
    const activeBoosters = user.boosters.filter(
      (b) => b.activated && (!b.expires_at || new Date(b.expires_at) > new Date())
    );

    let description = "";

    if (activeBoosters.length > 0) {
      description += t(lang, "active_boosters") + "\n";
      activeBoosters.forEach((booster) => {
        if (booster.type === "multiplier") {
          const expiresAt = booster.expires_at ? new Date(booster.expires_at).toLocaleString('de-DE') : t(lang, "permanently");
          description += `• ${booster.value}x ${t(lang, "multiplier_expires")}: ${expiresAt}\n`;
        } else {
          description += `• +${booster.value} ${t(lang, "points")} (${t(lang, "instant_received")})\n`;
        }
      });
      description += "\n";
    }

    if (availableBoosters.length > 0) {
      description += t(lang, "available_boosters") + "\n";
      availableBoosters.forEach((booster) => {
        if (booster.type === "multiplier") {
          const duration = booster.duration ? `${booster.duration / 1000 / 60} min` : t(lang, "permanently");
          description += `• ID ${booster.id}: ${booster.value}x (${duration})\n`;
        } else {
          description += `• ID ${booster.id}: +${booster.value} ${t(lang, "points")}\n`;
        }
      });
      description += "\n" + t(lang, "activate_hint");
    } else {
      if (activeBoosters.length === 0) {
        description += t(lang, "no_boosters");
      }
    }

    await interaction.reply({
      embeds: [
        {
          title: t(lang, "boosters_title"),
          description: description,
          color: 5814783,
          footer: {
            text: t(lang, "booster_footer"),
          },
        },
      ],
      ephemeral: true,
    });
  },
};
