require("dotenv").config();

module.exports = {
  staffOnly: true,
  command: {
    name: "unjudged",
    description: "Ruft alle unjudizierten Builds ab.",
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

    //get all unjudged builds, that means judges[] cardinality is < 2
    const allBuilds = await prisma.build.findMany();
    const unjudgedBuilds = allBuilds
      .filter((build) => build.judges.length < 2)
      .map((build) => ({
        id: build.id,
        discord_url: `https://discord.com/channels/${process.env.MAIN_GUILD_ID}/${process.env.JUDGE_CHANNEL}/${build.judge_msg}`
      }));

    if (unjudgedBuilds.length === 0) {
      return interaction.reply({
        content: "Alle Builds wurden bereits bewertet.",
        ephemeral: true,
      });
    }

    const unjudgedBuildsLong = unjudgedBuilds.map((build) => {
        return `[#${build.id}](${build.discord_url})`;
    }).join("\n");

    if(unjudgedBuildsLong.length > 2000) {
        const unjudgedBuildsShort = unjudgedBuilds.map((build) => {
            return `#${build.id}`;
        }).join("\n");
        return interaction.reply({
            content: `Die Liste ist zu lang, um sie anzuzeigen. Hier sind die IDs:\n${unjudgedBuildsShort}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
      content: `Folgende Builds wurden noch nicht bewertet:\n${unjudgedBuildsLong}`,
      ephemeral: true,
    });
  }
};
