require("dotenv").config();
const { BlobServiceClient } = require("@azure/storage-blob");
const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);
const containerClient = blobServiceClient.getContainerClient(
  process.env.CONTAINER_NAME
);

module.exports = {
  staffOnly: true,
  command: {
    name: "clearimages",
    description: "Löscht PERMANENT den Inhalt des Bild-Speichers",
    options: [
      {
        name: "sure",
        description: "Bist du sicher, dass du den Speicher löschen willst?",
        type: 5,
        required: true,
      },
      {
        name: "reason",
        description: "Grund für die Löschung des Speichers.",
        type: 3,
        required: true,
      }
    ],
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

    if (interaction.options.getBoolean("sure") === false) {
      return interaction.reply({
        content: "Du musst sicherstellen, dass du die Datenbank wirklich löschen möchtest.",
        ephemeral: true,
      });
    }

    const blobs = containerClient.listBlobsFlat();
    let i = 0;
    try {
      for await (const blob of blobs) {
        if (!blob.name.startsWith("wichtig/")) { // Do not delete important files
          i++;
          await containerClient.deleteBlob(blob.name, { deleteSnapshots: "include" });
        }
      }

      interaction.reply({
        content: `Die Gesamtheit von ${process.env.CDN_URL}/${process.env.CONTAINER_NAME}/ wurde geleert. ${i} Dateien. Grund: ${interaction.options.getString("reason")}`,
      });
    }
    catch (error) {
      console.error(error);
      interaction.reply({
        content: `Fehler beim Löschen des Speichers: ${error.message}`,
        ephemeral: true,
      });
    }
  }
}
