const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  path: "/leaderboard-local",
  method: "GET",
  handler: async (request, reply) => {
    const { guild_id } = request.query;

    if (!guild_id) {
      return reply.code(400).send({
        error: "Missing required query parameter: guild_id",
      });
    }

    let users = await prisma.user.findMany();
    users = users.filter((user) => user.guild_id === guild_id);
    users = users.sort((a, b) => b.points - a.points);
    users = users.filter((user) => user.points > 0);

    const builds = await prisma.build.findMany();
    const filteredBuilds = builds.filter((build) => build.guild_id === guild_id);

    let points = 0;
    users.forEach((user) => {
      points = points + user.points;
    });

    reply.send({
      users: JSON.parse(
        JSON.stringify(users, (_, v) =>
          typeof v === "bigint" ? v.toString() : v
        )
      ),
      builds: JSON.parse(
        JSON.stringify(filteredBuilds, (_, v) =>
          typeof v === "bigint" ? v.toString() : v
        )
      ),
      points: points,
    });
  },
};
