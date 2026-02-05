const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  path: "/leaderboard",
  method: "GET",
  handler: async (request, reply) => {
    const { guild_id } = request.query;

    let users = await prisma.user.findMany();
    
    // Filter by guild if specified
    if (guild_id) {
      users = users.filter((user) => user.guild_id === guild_id);
    }
    
    users = users.sort((a, b) => b.points - a.points);
    users = users.filter((user) => user.points > 0);
    
    const builds = await prisma.build.findMany();
    
    // Filter builds by guild if specified
    const filteredBuilds = guild_id 
      ? builds.filter((build) => build.guild_id === guild_id)
      : builds;
    
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
