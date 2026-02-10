const { t, getUserLanguage } = require("../config/translations.js");

module.exports = {
  command: {
    name: "activate_booster",
    description: "Activate a booster / Aktiviere einen Booster / Activer un booster",
    options: [
      {
        name: "id",
        description: "The ID of the booster you want to activate",
        type: 4,
        required: true,
      },
    ],
  },
  run: async (client, interaction, prisma) => {
    const lang = await getUserLanguage(prisma, interaction.user.id);
    const boosterId = interaction.options.getInteger("id");

    const booster = await prisma.booster.findUnique({
      where: {
        id: boosterId,
      },
    });

    if (!booster) {
      await interaction.reply({
        content: t(lang, "booster_not_found"),
        ephemeral: true,
      });
      return;
    }

    if (booster.user_id !== BigInt(interaction.user.id)) {
      await interaction.reply({
        content: t(lang, "not_your_booster"),
        ephemeral: true,
      });
      return;
    }

    if (booster.activated) {
      await interaction.reply({
        content: t(lang, "booster_already_active"),
        ephemeral: true,
      });
      return;
    }

    const now = new Date();

    if (booster.type === "points") {
      // Instant points booster - add points immediately
      await prisma.user.update({
        where: {
          id: BigInt(interaction.user.id),
        },
        data: {
          points: {
            increment: booster.value,
          },
        },
      });

      await prisma.booster.update({
        where: {
          id: boosterId,
        },
        data: {
          activated: true,
          activated_at: now,
        },
      });

      await interaction.reply({
        content: t(lang, "booster_activated_points", { value: booster.value }),
        ephemeral: true,
      });

      console.log(
        new Date().toLocaleString(),
        `User ${interaction.user.id} activated point booster (${booster.value} points)`
      );
    } else if (booster.type === "multiplier") {
      // Check if user already has an active multiplier
      const allActiveMultipliers = await prisma.booster.findMany({
        where: {
          user_id: BigInt(interaction.user.id),
          type: "multiplier",
          activated: true,
        },
      });

      // Filter for truly active boosters (not expired by time or builds)
      const activeMultipliers = allActiveMultipliers.filter((b) => {
        // Check if expired by time
        if (b.expires_at && new Date(b.expires_at) <= now) {
          return false;
        }
        // Check if expired by build count
        if (b.max_builds !== null && b.builds_used >= b.max_builds) {
          return false;
        }
        return true;
      });

      if (activeMultipliers.length > 0) {
        await interaction.reply({
          content: t(lang, "multiplier_already_active"),
          ephemeral: true,
        });
        return;
      }

      const expiresAt = booster.duration ? new Date(now.getTime() + booster.duration) : null;

      await prisma.booster.update({
        where: {
          id: boosterId,
        },
        data: {
          activated: true,
          activated_at: now,
          expires_at: expiresAt,
        },
      });

      // Build description based on booster type
      let durationText = "";
      if (booster.duration && booster.max_builds) {
        durationText = t(lang, "for_next_minutes_or_builds", { minutes: booster.duration / 1000 / 60, builds: booster.max_builds });
      } else if (booster.duration) {
        durationText = t(lang, "for_next_minutes", { minutes: booster.duration / 1000 / 60 });
      } else if (booster.max_builds) {
        durationText = t(lang, "for_next_builds", { builds: booster.max_builds });
      } else {
        durationText = t(lang, "permanently");
      }

      await interaction.reply({
        content: t(lang, "booster_activated_multiplier", { value: booster.value, duration: durationText }),
        ephemeral: true,
      });

      console.log(
        new Date().toLocaleString(),
        `User ${interaction.user.id} activated multiplier booster (${booster.value}x, duration: ${booster.duration}ms, max_builds: ${booster.max_builds})`
      );
    }
  },
};
