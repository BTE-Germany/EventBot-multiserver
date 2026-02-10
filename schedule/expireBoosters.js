module.exports = {
  time: 60000, // Run every minute
  run: async (client, prisma) => {
    const now = new Date();
    
    // Find all expired time-based boosters that are still marked as active
    const expiredTimeBoosters = await prisma.booster.findMany({
      where: {
        activated: true,
        expires_at: {
          lte: now,
          not: null,
        },
      },
    });

    // Find all expired build-limited boosters (where builds_used >= max_builds)
    const expiredBuildBoosters = await prisma.booster.findMany({
      where: {
        activated: true,
        max_builds: {
          not: null,
        },
      },
    });
    
    // Filter to only those that have reached their build limit
    const fullyExpiredBuildBoosters = expiredBuildBoosters.filter(
      booster => booster.builds_used >= booster.max_builds
    );

    const totalExpired = expiredTimeBoosters.length + fullyExpiredBuildBoosters.length;

    if (totalExpired > 0) {
      console.log(
        new Date().toLocaleString(),
        `${totalExpired} abgelaufene Booster gefunden (${expiredTimeBoosters.length} Zeit-basiert, ${fullyExpiredBuildBoosters.length} Build-limitiert)`
      );

      // Log expired time-based boosters
      for (const booster of expiredTimeBoosters) {
        console.log(
          new Date().toLocaleString(),
          `Zeit-Booster ${booster.id} für User ${booster.user_id} ist abgelaufen`
        );
      }
      
      // Log expired build-limited boosters
      for (const booster of fullyExpiredBuildBoosters) {
        console.log(
          new Date().toLocaleString(),
          `Build-limitierter Booster ${booster.id} für User ${booster.user_id} ist abgelaufen (${booster.builds_used}/${booster.max_builds} Builds benutzt)`
        );
      }
    }
  },
};
