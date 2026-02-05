const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  path: "/grant_booster",
  method: "POST",
  handler: async (request, reply) => {
    try {
      const { user_id, type, value, duration } = request.body;

      // Validate input
      if (!user_id || !type || !value) {
        return reply.status(400).send({
          error: "Missing required fields: user_id, type, value",
        });
      }

      if (type !== "points" && type !== "multiplier") {
        return reply.status(400).send({
          error: "Invalid type. Must be 'points' or 'multiplier'",
        });
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: {
          id: BigInt(user_id),
        },
      });

      if (!user) {
        return reply.status(404).send({
          error: "User not found",
        });
      }

      // Create booster
      const booster = await prisma.booster.create({
        data: {
          user_id: BigInt(user_id),
          type: type,
          value: parseFloat(value),
          duration: duration ? parseInt(duration) : null,
        },
      });

      reply.send({
        success: true,
        booster: JSON.parse(
          JSON.stringify(booster, (_, v) =>
            typeof v === "bigint" ? v.toString() : v
          )
        ),
      });

      console.log(
        new Date().toLocaleString(),
        `Booster granted to user ${user_id}: ${type} (${value})`
      );
    } catch (error) {
      console.error("Error granting booster:", error);
      reply.status(500).send({
        error: "Internal server error",
      });
    }
  },
};
