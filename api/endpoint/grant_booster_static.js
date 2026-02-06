const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  path: "/static/grant_booster_api",
  method: "POST",
  handler: async (request, reply) => {
    try {
      const { user_id, type, value, duration } = request.body;

      // Validate input
      if (!user_id || !type || !value) {
        const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Error</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        h1 { color: #dc3545; margin-bottom: 20px; }
        .error-icon { font-size: 64px; margin-bottom: 20px; }
        a {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">❌</div>
        <h1>Error</h1>
        <p>Missing required fields: user_id, type, value</p>
        <a href="/static/grant_booster">Go Back</a>
    </div>
</body>
</html>
        `;
        return reply.status(400).type("text/html").send(errorHtml);
      }

      if (type !== "points" && type !== "multiplier") {
        const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Error</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        h1 { color: #dc3545; margin-bottom: 20px; }
        .error-icon { font-size: 64px; margin-bottom: 20px; }
        a {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">❌</div>
        <h1>Error</h1>
        <p>Invalid type. Must be 'points' or 'multiplier'</p>
        <a href="/static/grant_booster">Go Back</a>
    </div>
</body>
</html>
        `;
        return reply.status(400).type("text/html").send(errorHtml);
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: {
          id: BigInt(user_id),
        },
      });

      if (!user) {
        const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Error</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        h1 { color: #dc3545; margin-bottom: 20px; }
        .error-icon { font-size: 64px; margin-bottom: 20px; }
        a {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">❌</div>
        <h1>Error</h1>
        <p>User not found</p>
        <a href="/static/grant_booster">Go Back</a>
    </div>
</body>
</html>
        `;
        return reply.status(404).type("text/html").send(errorHtml);
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

      console.log(
        new Date().toLocaleString(),
        `Booster granted to user ${user_id}: ${type} (${value})`
      );

      // Return HTML success page
      const successHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Booster Granted</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        h1 {
            color: #28a745;
            margin-bottom: 20px;
        }
        .success-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        .details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            margin: 20px 0;
            text-align: left;
        }
        .detail-row {
            margin: 10px 0;
        }
        .detail-label {
            font-weight: 600;
            color: #333;
        }
        a {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
        }
        a:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1>Booster Granted Successfully!</h1>
        <div class="details">
            <div class="detail-row">
                <span class="detail-label">User ID:</span> ${user_id}
            </div>
            <div class="detail-row">
                <span class="detail-label">Type:</span> ${type}
            </div>
            <div class="detail-row">
                <span class="detail-label">Value:</span> ${value}
            </div>
            <div class="detail-row">
                <span class="detail-label">Duration:</span> ${duration ? duration + ' seconds' : 'Permanent'}
            </div>
        </div>
        <a href="/static/grant_booster">Grant Another Booster</a>
    </div>
</body>
</html>
      `;

      reply.type("text/html").send(successHtml);
    } catch (error) {
      console.error("Error granting booster:", error);
      const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Error</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        h1 { color: #dc3545; margin-bottom: 20px; }
        .error-icon { font-size: 64px; margin-bottom: 20px; }
        a {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">❌</div>
        <h1>Error</h1>
        <p>Internal server error</p>
        <a href="/static/grant_booster">Go Back</a>
    </div>
</body>
</html>
      `;
      reply.status(500).type("text/html").send(errorHtml);
    }
  },
};
