const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  path: "/static/dashboard",
  method: "GET",
  handler: async (request, reply) => {
    try {
      // Get query parameters for time filtering
      const { days = 30 } = request.query;
      
      // Query 1: Total Builds Over Time
      const buildsOverTime = await prisma.$queryRaw`
        SELECT
          DATE(created_timestamp) as date,
          COUNT(*) as count
        FROM Build
        WHERE created_timestamp >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY)
        GROUP BY DATE(created_timestamp)
        ORDER BY date
      `;

      // Query 2: Builds by Team Over Time
      const buildsByTeam = await prisma.$queryRaw`
        SELECT
          DATE(b.created_timestamp) as date,
          COALESCE(u.team, 'Unknown') as team,
          COUNT(*) as count
        FROM Build b
        LEFT JOIN User u ON b.builder_id = u.id
        WHERE b.created_timestamp >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY)
        GROUP BY DATE(b.created_timestamp), u.team
        ORDER BY date, team
      `;

      // Query 3: Average Points per Build Over Time
      const avgPointsOverTime = await prisma.$queryRaw`
        SELECT
          DATE(created_timestamp) as date,
          ROUND(AVG(A + B + C), 2) as avg_points
        FROM Build
        WHERE created_timestamp >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY)
        GROUP BY DATE(created_timestamp)
        ORDER BY date
      `;

      // Query 4: Foreign vs Local Builds
      const foreignVsLocal = await prisma.$queryRaw`
        SELECT
          DATE(created_timestamp) as date,
          SUM(CASE WHEN foreign_build = 1 THEN 1 ELSE 0 END) as foreign,
          SUM(CASE WHEN foreign_build = 0 THEN 1 ELSE 0 END) as local
        FROM Build
        WHERE created_timestamp >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY)
        GROUP BY DATE(created_timestamp)
        ORDER BY date
      `;

      // Query 5: Average Scores by Category
      const scoresByCategory = await prisma.$queryRaw`
        SELECT
          DATE(created_timestamp) as date,
          ROUND(AVG(A), 2) as avg_a,
          ROUND(AVG(B), 2) as avg_b,
          ROUND(AVG(C), 2) as avg_c
        FROM Build
        WHERE created_timestamp >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY)
        GROUP BY DATE(created_timestamp)
        ORDER BY date
      `;

      // Query 6: Daily Build Activity (for bar chart)
      const dailyActivity = await prisma.$queryRaw`
        SELECT
          DATE(created_timestamp) as date,
          COUNT(*) as count
        FROM Build
        WHERE created_timestamp >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY)
        GROUP BY DATE(created_timestamp)
        ORDER BY date
      `;

      // Query 7: Top Builders
      const topBuilders = await prisma.$queryRaw`
        SELECT 
          u.minecraft_id,
          CASE 
            WHEN u.team = 'team_germany' THEN 'Germany'
            WHEN u.team = 'team_italia' THEN 'Italia'
            WHEN u.team = 'team_balkans' THEN 'Balkans'
            WHEN u.team = 'team_alpsbte' THEN 'AlpsBTE'
            WHEN u.team = 'team_france' THEN 'France'
            ELSE 'Unknown'
          END as team,
          u.points,
          COUNT(b.id) as total_builds,
          ROUND(AVG(b.A + b.B + b.C), 2) as avg_score
        FROM User u
        LEFT JOIN Build b ON u.id = b.builder_id
        WHERE u.banned = 0
          AND (b.created_timestamp IS NULL OR b.created_timestamp >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY))
        GROUP BY u.id, u.minecraft_id, u.team, u.points
        ORDER BY u.points DESC
        LIMIT 20
      `;

      // Query 8: Team Leaderboard
      const teamLeaderboard = await prisma.$queryRaw`
        SELECT 
          CASE 
            WHEN u.team = 'team_germany' THEN 'Germany'
            WHEN u.team = 'team_italia' THEN 'Italia'
            WHEN u.team = 'team_balkans' THEN 'Balkans'
            WHEN u.team = 'team_alpsbte' THEN 'AlpsBTE'
            WHEN u.team = 'team_france' THEN 'France'
            ELSE 'Unknown'
          END as team,
          COUNT(DISTINCT u.id) as builders,
          COUNT(b.id) as total_builds,
          ROUND(SUM(b.A + b.B + b.C), 2) as total_points,
          ROUND(AVG(b.A + b.B + b.C), 2) as avg_points_per_build
        FROM User u
        LEFT JOIN Build b ON u.id = b.builder_id
        WHERE u.banned = 0 
          AND u.team IS NOT NULL
          AND (b.created_timestamp IS NULL OR b.created_timestamp >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY))
        GROUP BY u.team
        ORDER BY total_builds DESC
      `;

      // Query 9: Team Distribution (Pie Chart)
      const teamDistribution = await prisma.$queryRaw`
        SELECT 
          CASE 
            WHEN u.team = 'team_germany' THEN 'Germany'
            WHEN u.team = 'team_italia' THEN 'Italia'
            WHEN u.team = 'team_balkans' THEN 'Balkans'
            WHEN u.team = 'team_alpsbte' THEN 'AlpsBTE'
            WHEN u.team = 'team_france' THEN 'France'
            ELSE 'Unknown'
          END as team,
          COUNT(b.id) as builds
        FROM Build b
        LEFT JOIN User u ON b.builder_id = u.id
        WHERE b.created_timestamp >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY)
        GROUP BY u.team
      `;

      // Query 10: Summary Stats
      const summaryStats = await prisma.$queryRaw`
        SELECT
          COUNT(DISTINCT b.id) as total_builds,
          COUNT(DISTINCT u.id) as total_builders,
          ROUND(SUM(b.A + b.B + b.C), 2) as total_points,
          ROUND(AVG(b.A + b.B + b.C), 2) as avg_points_per_build,
          SUM(CASE WHEN b.foreign_build = 1 THEN 1 ELSE 0 END) as foreign_builds,
          ROUND((SUM(CASE WHEN b.foreign_build = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as foreign_builds_percent
        FROM Build b
        LEFT JOIN User u ON b.builder_id = u.id
        WHERE b.created_timestamp >= DATE_SUB(NOW(), INTERVAL ${parseInt(days)} DAY)
          AND u.banned = 0
      `;

      // Convert BigInt to string for JSON serialization
      const jsonStringify = (data) => {
        return JSON.parse(
          JSON.stringify(data, (_, v) =>
            typeof v === "bigint" ? v.toString() : v
          )
        );
      };

      const data = {
        buildsOverTime: jsonStringify(buildsOverTime),
        buildsByTeam: jsonStringify(buildsByTeam),
        avgPointsOverTime: jsonStringify(avgPointsOverTime),
        foreignVsLocal: jsonStringify(foreignVsLocal),
        scoresByCategory: jsonStringify(scoresByCategory),
        dailyActivity: jsonStringify(dailyActivity),
        topBuilders: jsonStringify(topBuilders),
        teamLeaderboard: jsonStringify(teamLeaderboard),
        teamDistribution: jsonStringify(teamDistribution),
        summaryStats: jsonStringify(summaryStats[0]),
      };

      // Generate HTML
      const html = generateDashboardHTML(data, days);

      reply.type("text/html").send(html);
    } catch (error) {
      console.error("Dashboard error:", error);
      reply.status(500).send({ error: error.message });
    }
  },
};

function generateDashboardHTML(data, days) {
  const teamColors = {
    'Germany': 'rgba(255, 206, 86, 0.8)',
    'Italia': 'rgba(75, 192, 192, 0.8)',
    'Balkans': 'rgba(153, 102, 255, 0.8)',
    'AlpsBTE': 'rgba(255, 159, 64, 0.8)',
    'France': 'rgba(54, 162, 235, 0.8)',
    'Unknown': 'rgba(201, 203, 207, 0.8)',
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EventBot Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1600px;
            margin: 0 auto;
        }
        .header {
            background: white;
            border-radius: 10px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header h1 {
            color: #667eea;
            margin-bottom: 10px;
        }
        .header p {
            color: #666;
        }
        .time-filter {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        .time-filter button {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            background: #667eea;
            color: white;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
        }
        .time-filter button:hover {
            background: #764ba2;
            transform: translateY(-2px);
        }
        .time-filter button.active {
            background: #764ba2;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: white;
            border-radius: 10px;
            padding: 25px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s;
        }
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 12px rgba(0, 0, 0, 0.15);
        }
        .stat-card h3 {
            color: #666;
            font-size: 14px;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .stat-card .value {
            font-size: 36px;
            font-weight: bold;
            color: #667eea;
        }
        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(600px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .chart-container {
            background: white;
            border-radius: 10px;
            padding: 25px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            position: relative;
        }
        .chart-container h2 {
            margin-bottom: 20px;
            color: #333;
            font-size: 18px;
        }
        .chart-wrapper {
            position: relative;
            height: 400px;
        }
        .download-btn {
            position: absolute;
            top: 25px;
            right: 25px;
            padding: 8px 16px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.3s;
            z-index: 10;
        }
        .download-btn:hover {
            background: #764ba2;
        }
        .table-container {
            background: white;
            border-radius: 10px;
            padding: 25px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background: #667eea;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid #eee;
        }
        tr:hover {
            background: #f5f5f5;
        }
        @media (max-width: 1200px) {
            .charts-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 EventBot Statistics Dashboard</h1>
            <p>Last ${days} days - Auto-refreshes every 60 seconds</p>
            <div class="time-filter">
                <button onclick="changeTimeRange(7)" class="${days == 7 ? 'active' : ''}">Last 7 Days</button>
                <button onclick="changeTimeRange(14)" class="${days == 14 ? 'active' : ''}">Last 14 Days</button>
                <button onclick="changeTimeRange(30)" class="${days == 30 ? 'active' : ''}">Last 30 Days</button>
                <button onclick="changeTimeRange(90)" class="${days == 90 ? 'active' : ''}">Last 90 Days</button>
                <button onclick="changeTimeRange(365)" class="${days == 365 ? 'active' : ''}">Last Year</button>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total Builds</h3>
                <div class="value">${data.summaryStats.total_builds || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Total Builders</h3>
                <div class="value">${data.summaryStats.total_builders || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Total Points</h3>
                <div class="value">${data.summaryStats.total_points || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Avg Points/Build</h3>
                <div class="value">${data.summaryStats.avg_points_per_build || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Foreign Builds</h3>
                <div class="value">${data.summaryStats.foreign_builds || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Foreign Builds %</h3>
                <div class="value">${data.summaryStats.foreign_builds_percent || 0}%</div>
            </div>
        </div>

        <div class="charts-grid">
            <div class="chart-container">
                <h2>Total Builds Over Time</h2>
                <button class="download-btn" onclick="downloadChart('buildsOverTimeChart')">📥 Download PNG</button>
                <div class="chart-wrapper">
                    <canvas id="buildsOverTimeChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <h2>Builds by Team Over Time</h2>
                <button class="download-btn" onclick="downloadChart('buildsByTeamChart')">📥 Download PNG</button>
                <div class="chart-wrapper">
                    <canvas id="buildsByTeamChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <h2>Average Points per Build</h2>
                <button class="download-btn" onclick="downloadChart('avgPointsChart')">📥 Download PNG</button>
                <div class="chart-wrapper">
                    <canvas id="avgPointsChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <h2>Foreign vs Local Builds</h2>
                <button class="download-btn" onclick="downloadChart('foreignVsLocalChart')">📥 Download PNG</button>
                <div class="chart-wrapper">
                    <canvas id="foreignVsLocalChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <h2>Average Scores by Category</h2>
                <button class="download-btn" onclick="downloadChart('scoresByCategoryChart')">📥 Download PNG</button>
                <div class="chart-wrapper">
                    <canvas id="scoresByCategoryChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <h2>Daily Build Activity</h2>
                <button class="download-btn" onclick="downloadChart('dailyActivityChart')">📥 Download PNG</button>
                <div class="chart-wrapper">
                    <canvas id="dailyActivityChart"></canvas>
                </div>
            </div>

            <div class="chart-container">
                <h2>Team Distribution</h2>
                <button class="download-btn" onclick="downloadChart('teamDistributionChart')">📥 Download PNG</button>
                <div class="chart-wrapper">
                    <canvas id="teamDistributionChart"></canvas>
                </div>
            </div>
        </div>

        <div class="table-container">
            <h2>🏆 Top 20 Builders</h2>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Minecraft Name</th>
                        <th>Team</th>
                        <th>Points</th>
                        <th>Total Builds</th>
                        <th>Avg Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.topBuilders.map((builder, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${builder.minecraft_id}</td>
                            <td>${builder.team}</td>
                            <td>${builder.points}</td>
                            <td>${builder.total_builds || 0}</td>
                            <td>${builder.avg_score || 0}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="table-container">
            <h2>🎯 Team Leaderboard</h2>
            <table>
                <thead>
                    <tr>
                        <th>Team</th>
                        <th>Builders</th>
                        <th>Total Builds</th>
                        <th>Total Points</th>
                        <th>Avg Points/Build</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.teamLeaderboard.map((team) => `
                        <tr>
                            <td>${team.team}</td>
                            <td>${team.builders}</td>
                            <td>${team.total_builds || 0}</td>
                            <td>${team.total_points || 0}</td>
                            <td>${team.avg_points_per_build || 0}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>

    <script>
        const teamColors = ${JSON.stringify(teamColors)};
        const data = ${JSON.stringify(data)};

        // Chart 1: Builds Over Time
        new Chart(document.getElementById('buildsOverTimeChart'), {
            type: 'line',
            data: {
                labels: data.buildsOverTime.map(d => new Date(d.date).toLocaleDateString()),
                datasets: [{
                    label: 'Total Builds',
                    data: data.buildsOverTime.map(d => parseInt(d.count)),
                    borderColor: 'rgb(102, 126, 234)',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                }
            }
        });

        // Chart 2: Builds by Team
        const teamData = {};
        data.buildsByTeam.forEach(item => {
            if (!teamData[item.team]) {
                teamData[item.team] = {
                    labels: [],
                    data: []
                };
            }
            teamData[item.team].labels.push(new Date(item.date).toLocaleDateString());
            teamData[item.team].data.push(parseInt(item.count));
        });

        const teamDatasets = Object.keys(teamData).map(team => ({
            label: team,
            data: teamData[team].data,
            borderColor: teamColors[team] || 'rgba(201, 203, 207, 0.8)',
            backgroundColor: (teamColors[team] || 'rgba(201, 203, 207, 0.8)').replace('0.8', '0.2'),
            fill: true,
            tension: 0.4
        }));

        new Chart(document.getElementById('buildsByTeamChart'), {
            type: 'line',
            data: {
                labels: data.buildsOverTime.map(d => new Date(d.date).toLocaleDateString()),
                datasets: teamDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    y: {
                        stacked: true
                    }
                }
            }
        });

        // Chart 3: Average Points
        new Chart(document.getElementById('avgPointsChart'), {
            type: 'line',
            data: {
                labels: data.avgPointsOverTime.map(d => new Date(d.date).toLocaleDateString()),
                datasets: [{
                    label: 'Average Points per Build',
                    data: data.avgPointsOverTime.map(d => parseFloat(d.avg_points)),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                }
            }
        });

        // Chart 4: Foreign vs Local
        new Chart(document.getElementById('foreignVsLocalChart'), {
            type: 'line',
            data: {
                labels: data.foreignVsLocal.map(d => new Date(d.date).toLocaleDateString()),
                datasets: [
                    {
                        label: 'Foreign Builds',
                        data: data.foreignVsLocal.map(d => parseInt(d.foreign)),
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Local Builds',
                        data: data.foreignVsLocal.map(d => parseInt(d.local)),
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.1)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                }
            }
        });

        // Chart 5: Scores by Category
        new Chart(document.getElementById('scoresByCategoryChart'), {
            type: 'line',
            data: {
                labels: data.scoresByCategory.map(d => new Date(d.date).toLocaleDateString()),
                datasets: [
                    {
                        label: 'Category A',
                        data: data.scoresByCategory.map(d => parseFloat(d.avg_a)),
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        fill: false,
                        tension: 0.4
                    },
                    {
                        label: 'Category B',
                        data: data.scoresByCategory.map(d => parseFloat(d.avg_b)),
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        fill: false,
                        tension: 0.4
                    },
                    {
                        label: 'Category C',
                        data: data.scoresByCategory.map(d => parseFloat(d.avg_c)),
                        borderColor: 'rgb(255, 206, 86)',
                        backgroundColor: 'rgba(255, 206, 86, 0.1)',
                        fill: false,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                }
            }
        });

        // Chart 6: Daily Activity (Bar)
        new Chart(document.getElementById('dailyActivityChart'), {
            type: 'bar',
            data: {
                labels: data.dailyActivity.map(d => new Date(d.date).toLocaleDateString()),
                datasets: [{
                    label: 'Builds per Day',
                    data: data.dailyActivity.map(d => parseInt(d.count)),
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: 'rgb(102, 126, 234)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                }
            }
        });

        // Chart 7: Team Distribution (Pie)
        new Chart(document.getElementById('teamDistributionChart'), {
            type: 'pie',
            data: {
                labels: data.teamDistribution.map(d => d.team),
                datasets: [{
                    data: data.teamDistribution.map(d => parseInt(d.builds)),
                    backgroundColor: data.teamDistribution.map(d => teamColors[d.team] || 'rgba(201, 203, 207, 0.8)')
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: true,
                        position: 'right'
                    }
                }
            }
        });

        // Download chart as PNG
        function downloadChart(chartId) {
            const canvas = document.getElementById(chartId);
            const url = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = chartId + '-' + new Date().toISOString().split('T')[0] + '.png';
            link.href = url;
            link.click();
        }

        // Change time range
        function changeTimeRange(days) {
            window.location.href = '/dashboard?days=' + days;
        }

        // Auto-refresh every 60 seconds
        setTimeout(() => {
            window.location.reload();
        }, 60000);
    </script>
</body>
</html>
  `;
}
