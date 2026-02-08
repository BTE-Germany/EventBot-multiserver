require("dotenv").config();

module.exports = {
  command: {
    name: "cleardatabase",
    description: "Löscht PERMANENT den Inhalt der BUILD-Tabelle und setzt alle Punkte auf 0.",
    options: [
      {
        name: "sure",
        description: "Bist du sicher, dass du die Datenbank löschen willst?",
        type: 5,
        required: true,
      },
      {
        name: "reason",
        description: "Grund für die Löschung der Datenbank.",
        type: 3,
        required: true,
      }
    ],
  },
  run: async (client, interaction, prisma) => {
    if (interaction.options.getBoolean("sure") === false) {
      return interaction.reply({
        content: "Du musst sicherstellen, dass du die Datenbank wirklich löschen möchtest.",
        ephemeral: true,
      });
    }

    const builds = await prisma.build.findMany();

    if (builds.length === 0) {
      return interaction.reply({
        content: "The database is already empty.",
        ephemeral: true,
      });
    }

    const reason = interaction.options.getString("reason");

    await prisma.build.deleteMany();
    await prisma.$executeRawUnsafe(`ALTER TABLE Build AUTO_INCREMENT = 1;`);
    await prisma.user.updateMany({
      data: {
        points: 0,
      },
    });

    interaction.reply({
      content: "BUILD-Tabelle geleert. Alle Punkte auf 0 zurückgesetzt. Reason: " + reason
    });
  }
};
