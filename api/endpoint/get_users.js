const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  path: "/users",
  method: "GET",
  handler: async (request, reply) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          minecraft_id: true,
        },
        orderBy: {
          minecraft_id: "asc",
        },
      });

      // Convert BigInt to string for JSON serialization
      const usersFormatted = users.map((user) => ({
        id: user.id.toString(),
        minecraft_id: user.minecraft_id,
      }));

      reply.send(usersFormatted);
    } catch (error) {
      console.error("Error fetching users:", error);
      reply.status(500).send({
        error: "Internal server error",
      });
    }
  },
};
