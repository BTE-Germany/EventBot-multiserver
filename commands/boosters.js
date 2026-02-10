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
    const activeBoosters = user.boosters.filter((b) => {
      if (!b.activated) return false;
      
      const now = new Date();
      
      // Check time-based expiry
      if (b.expires_at && new Date(b.expires_at) <= now) {
        return false;
      }
      
      // Check build-limited expiry
      if (b.max_builds !== null && b.builds_used >= b.max_builds) {
        return false;
      }
      
      return true;
    });

    let description = "";

    if (activeBoosters.length > 0) {
      description += t(lang, "active_boosters") + "\n";
      activeBoosters.forEach((booster) => {
        if (booster.type === "multiplier") {
          let expiryInfo = "";
          if (booster.expires_at && booster.max_builds) {
            const timeRemaining = new Date(booster.expires_at).toLocaleString('de-DE');
            const buildsRemaining = booster.max_builds - booster.builds_used;
            expiryInfo = `${timeRemaining} ${t(lang, "or")} ${buildsRemaining} ${t(lang, "builds_remaining")}`;
          } else if (booster.expires_at) {
            expiryInfo = new Date(booster.expires_at).toLocaleString('de-DE');
          } else if (booster.max_builds) {
            const buildsRemaining = booster.max_builds - booster.builds_used;
            expiryInfo = `${buildsRemaining} ${t(lang, "builds_remaining")}`;
          } else {
            expiryInfo = t(lang, "permanently");
          }
          description += `• ${booster.value}x ${t(lang, "multiplier_expires")}: ${expiryInfo}\n`;
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
          let durationInfo = "";
          if (booster.duration && booster.max_builds) {
            durationInfo = `${booster.duration / 1000 / 60} min ${t(lang, "or")} ${booster.max_builds} ${t(lang, "builds")}`;
          } else if (booster.duration) {
            durationInfo = `${booster.duration / 1000 / 60} min`;
          } else if (booster.max_builds) {
            durationInfo = `${booster.max_builds} ${t(lang, "builds")}`;
          } else {
            durationInfo = t(lang, "permanently");
          }
          description += `• ID ${booster.id}: ${booster.value}x (${durationInfo})\n`;
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
