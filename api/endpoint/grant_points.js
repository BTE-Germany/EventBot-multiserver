const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  path: "/grant_points",
  method: "POST",
  handler: async (request, reply) => {
    try {
      const { user_id, points } = request.body;

      // Validate input
      if (!user_id || points === undefined || points === null) {
        return reply.status(400).send({
          error: "Missing required fields: user_id, points",
        });
      }

      const pointsValue = parseFloat(points);
      if (isNaN(pointsValue)) {
        return reply.status(400).send({
          error: "Invalid points value. Must be a number.",
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

      // Update user points
      const updatedUser = await prisma.user.update({
        where: {
          id: BigInt(user_id),
        },
        data: {
          points: {
            increment: pointsValue,
          },
        },
      });

      reply.send({
        success: true,
        user: JSON.parse(
          JSON.stringify(updatedUser, (_, v) =>
            typeof v === "bigint" ? v.toString() : v
          )
        ),
        points_granted: pointsValue,
      });

      console.log(
        new Date().toLocaleString(),
        `Points granted to user ${user_id}: ${pointsValue} (new total: ${updatedUser.points})`
      );
    } catch (error) {
      console.error("Error granting points:", error);
      reply.status(500).send({
        error: "Internal server error",
      });
    }
  },
};
