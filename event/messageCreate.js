require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { BlobServiceClient } = require("@azure/storage-blob");
const { t, getUserLanguage } = require("../config/translations.js");
const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);
const crypto = require("crypto");
const containerClient = blobServiceClient.getContainerClient(
  process.env.CONTAINER_NAME
);

module.exports = {
  name: "messageCreate",
  once: false,
  async execute(args) {
    if (args.author.id === args.client.user.id) return;
    
    // Parse servers config to check if this channel is a submission channel
    let serversConfig = {};
    try {
      serversConfig = JSON.parse(process.env.SERVERS_CONFIG || "{}");
    } catch (e) {
      console.error("Error parsing SERVERS_CONFIG:", e);
      return;
    }

    // Check if message is in a submission channel
    const serverConfig = serversConfig[args.guild.id];
    if (!serverConfig || args.channel.id !== serverConfig.submission) {
      return; // Not a submission channel
    }

    const dbUser = await prisma.user.findUnique({
      where: {
        id: BigInt(args.author.id),
      },
    });
    
    if (!dbUser) {
      const lang = "en"; // Default language for non-registered users
      const botmessage = await args.channel.send({
        content: t(lang, "not_registered"),
        messageReference: {
          messageID: args.id,
        },
      });
      setTimeout(async () => {
        await botmessage.delete();
        await args.delete();
      }, 5000);
    } else {
      const lang = dbUser.language || "en";
        if (
          args.attachments.map((a) => a).length > 0 &&
          args.content.length > 0
        ) {
          prisma.build
            .create({
              data: {
                builder_id: BigInt(args.author.id),
                message: BigInt(args.id),
                images: ["loading"],
                judges: [],
                location: args.content,
                guild_id: args.guild.id, // Track which server this build is from
              },
            })
            .then(async (obj) => {
              const user = args.author;
              let embeds = [
                {
                  title: `#${obj.id}`,
                  description: "Coordinates: " + obj.location,
                  url: "https://bte-germany.de",
                  author: {
                    name: `${dbUser.minecraft_id}${dbUser.team_flag ? ' ' + dbUser.team_flag : ''}`,
                  },
                },
              ];
              let images = [];
              for (const image of args.attachments.map((a) => a).slice(0, 3)) {
                let uuid = crypto.randomUUID();
                const response = await fetch(image.url);
                const buffer = await response.arrayBuffer();
                let filetype = image.name.split('.').pop().split('?')[0];
                const blockBlobClient = containerClient.getBlockBlobClient(
                  `${user.id}/${uuid}.${filetype}`
                );
                await blockBlobClient.uploadData(buffer, buffer.byteLength);
                embeds.push({
                  url: "https://bte-germany.de",
                  image: {
                    url: `${process.env.CDN_URL}/${process.env.CONTAINER_NAME
                      }/${user.id}/${uuid}.${filetype}`,
                  },
                });
                images.push(
                  `${process.env.CDN_URL}/${process.env.CONTAINER_NAME}/${user.id
                  }/${uuid}.${filetype}`
                );
              }
              await prisma.build.update({
                where: {
                  id: obj.id,
                },
                data: {
                  images: images,
                },
              });
              
              // Send to ALL submission channels
              for (const [guildId, config] of Object.entries(serversConfig)) {
                try {
                  const channel = await args.client.channels.fetch(config.submission);
                  await channel.send({
                    content: " ",
                    embeds: embeds,
                    components: [
                      {
                        type: 1,
                        components: [
                          {
                            type: 2,
                            style: 2,
                          label: "Additional Information",
                            custom_id: `info_${obj.id}`,
                            emoji: "📍"
                          }
                        ]
                      }
                    ]
                  }).then(async (message) => {
                    // Only store the message ID from the original guild
                    if (guildId === args.guild.id) {
                      await prisma.build.update({
                        where: {
                          id: obj.id,
                        },
                        data: {
                          message: BigInt(message.id),
                        },
                      });
                    }
                  });
                } catch (error) {
                  console.error(`Error sending to submission channel ${config.submission}:`, error);
                }
              }
              
              args.client.channels.cache
                .get(process.env.JUDGE_CHANNEL)
                .send({
                  content: `<@&${process.env.PING_ROLE}>`,
                  embeds: embeds,
                })
                .then(async (msg) => {
                  await prisma.build.update({
                    where: {
                      id: obj.id,
                    },
                    data: {
                      judge_msg: BigInt(msg.id),
                    },
                  });
                });
              await args.delete();
              console.log(
                new Date().toLocaleString(),
                `Neuer Build erstellt von ${dbUser.minecraft_id} mit der ID ${obj.id}`
              );
            });
          await prisma.user.update({
            where: {
              id: BigInt(args.author.id),
            },
            data: {
              points: dbUser.points + 5,
            },
          });
        } else {
          const botmessage = await args.channel.send({
            content: t(lang, "image_coords_required"),
          });
          setTimeout(async () => {
            await botmessage.delete();
            await args.delete();
          }, 5000);
        }
      }
    }
  }

