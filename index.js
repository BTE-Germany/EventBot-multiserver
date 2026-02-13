const path = require("path");
const fs = require("fs");
const discord = require("discord.js");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();
const client = new discord.Client({
  intents: new discord.IntentsBitField(33283),
});
const prisma = new PrismaClient();
const api = require("./api/api.js");

const commands = [];
const buttons = [];
const modals = [];
client.on("ready", () => {
  console.log(new Date().toLocaleString(), "Ready!");
});

const eventsPath = path.join(__dirname, "event");
const eventFiles = fs.readdirSync(eventsPath);

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.name !== "ready" && event.name !== "interactionCreate") {
    if (event.once) {
      console.log(
        new Date().toLocaleString(),
        `Event registriert: ${event.name}`
      );
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      console.log(
        new Date().toLocaleString(),
        `Event registriert: ${event.name}`
      );
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}

client.once("ready", async () => {
  // Clear all commands if CLEAR_COMMANDS is set to true
  if (process.env.CLEAR_COMMANDS === "true") {
    console.log(new Date().toLocaleString(), "Clearing all commands...");
    
    // Clear global commands
    await client.application.commands.set([]);
    console.log(new Date().toLocaleString(), "Global commands cleared");
    
    // Clear guild commands for all guilds
    for (const [guildId, guild] of client.guilds.cache) {
      await guild.commands.set([]);
      console.log(new Date().toLocaleString(), `Guild commands cleared for: ${guild.name}`);
    }
    
    console.log(new Date().toLocaleString(), "All commands cleared. Set CLEAR_COMMANDS=false and restart.");
    return;
  }
  
  //load command from command handler dir
  // client.application.commands.set([]);
  const commandFiles = fs
    .readdirSync("./commands")
    .filter((file) => file.endsWith(".js"));
  
  const mainGuildId = process.env.MAIN_GUILD_ID;
  const mainGuild = mainGuildId ? client.guilds.cache.get(mainGuildId) : null;
  
  for (const file of commandFiles) {
    let data = require(`./commands/${file}`);
    commands.push(data);
    
    const isStaffOnly = data.staffOnly || false;
    
    if (isStaffOnly && mainGuild) {
      // Register staff commands only to main guild
      mainGuild.commands
        .create(data.command)
        .then(() =>
          console.log(
            new Date().toLocaleString(),
            `Command registriert (Main Guild): /${data.command.name}`
          )
        )
        .catch(console.error);
    } else if (!isStaffOnly) {
      // Register public commands globally
      client.application.commands
        .create(data.command)
        .then(() =>
          console.log(
            new Date().toLocaleString(),
            `Command registriert (Global): /${data.command.name}`
          )
        )
        .catch(console.error);
    } else if (isStaffOnly && !mainGuild) {
      console.warn(
        new Date().toLocaleString(),
        `Warning: Staff command /${data.command.name} not registered - MAIN_GUILD_ID not set or guild not found`
      );
    }
  }

  const scheduleFiles = fs
    .readdirSync("./schedule")
    .filter((file) => file.endsWith(".js"));
  for (const file of scheduleFiles) {
    let data = require(`./schedule/${file}`);
    console.log(
      new Date().toLocaleString(),
      `Schedule registriert: ${file} (${data.time}ms)`
    );
    data.run(client, prisma);
    setInterval(() => {
      data.run(client, prisma);
    }, data.time);
  }

  const buttonFiles = fs
    .readdirSync("./buttons")
    .filter((file) => file.endsWith(".js"));
  for (const file of buttonFiles) {
    let data = require(`./buttons/${file}`);
    buttons.push(data);
  }

  const modalFiles = fs
    .readdirSync("./modals")
    .filter((file) => file.endsWith(".js"));
  for (const file of modalFiles) {
    let data = require(`./modals/${file}`);
    modals.push(data);
  }

  await api.start();
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand()) {
    const command = commands.find(
      (command) => command.command.name === interaction.commandName
    );
    if (!command) return;
    try {
      await command.run(client, interaction, prisma);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "Beim Registrieren dieses Befehls ist ein Fehler aufgetreten!",
        ephemeral: true,
      });
    }
  }
  if (interaction.isButton()) {
    const button = buttons.find((button) =>
      interaction.customId.startsWith(button.button.name)
    );
    if (!button) return;
    try {
      await button.run(client, interaction, prisma);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content:
          "Beim Ausführen dieser Schaltfläche ist ein Fehler aufgetreten! ",
        ephemeral: true,
      });
    }
  }

  //is modal
  if (interaction.isModalSubmit()) {
    const modal = modals.find((modal) =>
      interaction.customId.startsWith(modal.modal.name)
    );
    if (!modal) return;
    try {
      await modal.run(client, interaction, prisma);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "Beim Ausführen dieses Modals ist ein Fehler aufgetreten! ",
        ephemeral: true,
      });
    }
  }
});

client.login(process.env.BOT_TOKEN);
