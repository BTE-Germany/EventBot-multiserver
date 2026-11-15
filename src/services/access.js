// Who is a bot administrator: OWNER_ID from .env plus the admins list from the dashboard
function createAccessService({ ownerId, settings }) {
  return {
    ownerId: String(ownerId),
    isOwner: (userId) => String(userId) === String(ownerId),
    async isAdmin(userId) {
      if (String(userId) === String(ownerId)) return true;
      const { admins } = await settings.get();
      return admins.includes(String(userId));
    },
  };
}

module.exports = { createAccessService };
