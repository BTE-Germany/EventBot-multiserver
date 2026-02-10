// Define all available build teams with their properties
module.exports = {
  teams: [
    {
      id: "team_germany",
      name: "Team Germany",
      flag: "🇩🇪",
      guild_ids: ["692825222373703772"],
    }
  ],

  // Get team by guild ID
  getTeamByGuildId: function (guildId) {
    return this.teams.find((team) => team.guild_ids.includes(guildId));
  },

  // Get team by team ID
  getTeamById: function (teamId) {
    return this.teams.find((team) => team.id === teamId);
  },

  // Get all guild IDs for a team
  getGuildIdsForTeam: function (teamId) {
    const team = this.getTeamById(teamId);
    return team ? team.guild_ids : [];
  },
};
