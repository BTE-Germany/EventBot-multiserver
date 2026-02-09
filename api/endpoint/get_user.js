const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  path: "/get_user",
  method: "GET",
  handler: async (request, reply) => {
    try {
      const { user_id, minecraft_id } = request.query;

      // Validate input - at least one identifier is required
      if (!user_id && !minecraft_id) {
        return reply.status(400).send({
          error: "Missing required parameter: user_id or minecraft_id",
        });
      }

      // Search by user_id or minecraft_id
      let user;
      if (user_id) {
        user = await prisma.user.findUnique({
          where: {
            id: BigInt(user_id),
          },
          include: {
            boosters: true,
          },
        });
      } else if (minecraft_id) {
        user = await prisma.user.findUnique({
          where: {
            minecraft_id: minecraft_id,
          },
          include: {
            boosters: true,
          },
        });
      }

      if (!user) {
        return reply.status(404).send({
          error: "User not found",
        });
      }

      // Get user's builds
      const builds = await prisma.build.findMany({
        where: {
          builder_id: user.id,
        },
      });

      reply.send({
        user: JSON.parse(
          JSON.stringify(user, (_, v) =>
            typeof v === "bigint" ? v.toString() : v
          )
        ),
        builds: JSON.parse(
          JSON.stringify(builds, (_, v) =>
            typeof v === "bigint" ? v.toString() : v
          )
        ),
      });
    } catch (error) {
      console.error("Error getting user:", error);
      reply.status(500).send({
        error: "Internal server error",
      });
    }
  },
};
