const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  path: "/grant_points",
  method: "POST",
  handler: async (request, reply) => {
    try {
      const { user_id, points } = request.body;

      if (!user_id || points === undefined || points === null) {
        return reply.status(400).send({
          error: "Missing required fields: user_id, points",
        });
      }

      const pointsValue = Number(points);
      if (!Number.isFinite(pointsValue)) {
        return reply.status(400).send({
          error: "Invalid points value. Must be a number.",
        });
      }
      
      if (pointsValue === 0) {
        return reply.status(400).send({ error: "Points must not be 0." });
      }

      const userId = BigInt(user_id);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, points: true },
      });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      // Optional: prevent negative totals
      const newTotal = user.points + pointsValue;
      if (newTotal < 0) {
        return reply.status(400).send({
          error: "Insufficient points to deduct that amount.",
          current_points: user.points,
          attempted_change: pointsValue,
        });
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          points: {
            increment: pointsValue, // negative value => deduction
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
        points_change: pointsValue,
      });

      console.log(
        new Date().toLocaleString(),
        `Points change for user ${user_id}: ${pointsValue} (new total: ${updatedUser.points})`
      );
    } catch (error) {
      console.error("Error changing points:", error);
      reply.status(500).send({ error: "Internal server error" });
    }
  },
};
