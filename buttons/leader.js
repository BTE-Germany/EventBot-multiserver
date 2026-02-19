const { t, getUserLanguage } = require("../config/translations.js");

module.exports = {
    button: {
        name: "leader-"
    },
    run: async (client, interaction, prisma) => {
        const lang = await getUserLanguage(prisma, interaction.user.id);
        const pageNum = parseInt(interaction.customId.split("leader-")[1], 10);

        if (Number.isNaN(pageNum) || pageNum < 0) {
            interaction.reply({
                content: t(lang, "no_more_pages"),
                ephemeral: true,
            });
            return;
        }

        // Get guild ID from the message to filter users
        const guildId = interaction.guild.id;

        const formatUserList = (users, startIndex) => {
            if (users.length === 0) {
                return "-";
            }

            let userlist = "";
            let increment = startIndex;
            users.forEach((user) => {
                userlist += `${increment}. ${user.team_flag} \`${user.minecraft_id}\`  |  ${user.points} ${t(lang, "points")} \n`;
                increment++;
            });

            return userlist;
        };

        let users = await prisma.user.findMany();

        users = users.map((user) => {
            return {
                id: user.id.toString(),
                points: user.points,
                minecraft_id: user.minecraft_id,
                team_flag: user.team_flag || "",
                guild_id: user.guild_id,
            };
        });
        users = users.sort((a, b) => b.points - a.points);
        users = users.filter((user) => user.points > 0);

        const globalUsers = users.slice(pageNum * 10, pageNum * 10 + 10);
        const localUsers = users
            .filter((user) => user.guild_id === guildId)
            .slice(pageNum * 10, pageNum * 10 + 10);

        if (globalUsers.length === 0 && localUsers.length === 0) {
            interaction.reply({
                content: t(lang, "no_more_pages"),
                ephemeral: true,
            });
            return;
        }

        const startIndex = pageNum * 10 + 1;
        const globalList = formatUserList(globalUsers, startIndex);
        const localList = formatUserList(localUsers, startIndex);

        interaction.reply({
            "content": null,
            "embeds": [
                {
                    "title": t(lang, "leaderboard_page", { page: pageNum }),
                    "description": `**Global**\n${globalList}\n\n**Local**\n${localList}`,
                    "color": 13697024,
                    "footer": {
                        "text": t(lang, "leaderboard_footer")
                    },
                    "thumbnail": {
                        "url": process.env.EVENT_IMG
                    }
                }
            ],
            "attachments": [],
            "ephemeral": true,
            "components": [
                {
                    "type": 1,
                    "components": [
                        {
                            "style": 3,
                            "label": `${t(lang, "page")} ${pageNum + 1}`,
                            "custom_id": `leader-${pageNum + 1}`,
                            "disabled": false,
                            "emoji": {
                                "name": `➡`
                            },
                            "type": 2
                        }
                    ]
                }
            ]
        });
    },
};
