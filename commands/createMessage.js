module.exports = {
  staffOnly: true,
  command: {
    name: "createmsg",
    description: "Erzeugt eine Nachricht für den Leaderboard-Kanal",
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

    interaction.reply({
      content: "Ok.",
      ephemeral: true,
    });
    interaction.channel.send(
      "Kopiere die ID dieser Nachricht und füge sie in die `LEADERBOARD_MESSAGE`-Spalte .der `env`-Datei ein."
    );
  },
};
