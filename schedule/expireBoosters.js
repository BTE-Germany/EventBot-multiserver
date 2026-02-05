module.exports = {
  time: 60000, // Run every minute
  run: async (client, prisma) => {
    const now = new Date();
    
    // Find all expired boosters that are still marked as active
    const expiredBoosters = await prisma.booster.findMany({
      where: {
        activated: true,
        expires_at: {
          lte: now,
          not: null,
        },
      },
    });

    if (expiredBoosters.length > 0) {
      console.log(
        new Date().toLocaleString(),
        `${expiredBoosters.length} abgelaufene Booster gefunden`
      );

      // We don't actually need to deactivate them - they're filtered by expires_at
      // But we can log them for tracking purposes
      for (const booster of expiredBoosters) {
        console.log(
          new Date().toLocaleString(),
          `Booster ${booster.id} für User ${booster.user_id} ist abgelaufen`
        );
      }
    }
  },
};
