const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const prisma = new PrismaClient();

module.exports = {
  path: "/",
  method: "GET",
  handler: async (request, reply) => {
    try {
      // Fetch users from database
      const users = await prisma.user.findMany({
        select: {
          id: true,
          minecraft_id: true,
        },
        orderBy: {
          minecraft_id: "asc",
        },
      });

      // Convert BigInt to string for JavaScript
      const usersFormatted = users.map((user) => ({
        id: user.id.toString(),
        minecraft_id: user.minecraft_id,
      }));

      // Read the HTML template
      const htmlPath = path.join(__dirname, "../public/index.html");
      let html = fs.readFileSync(htmlPath, "utf8");

      // Inject users data into the HTML
      const usersJSON = JSON.stringify(usersFormatted);
      html = html.replace(
        "let allUsers = [];",
        `let allUsers = ${usersJSON};`
      );
      html = html.replace(
        "// Load users when page loads\n        loadUsers();",
        "// Users are pre-loaded via SSR (no need to fetch)\n        console.log(`Pre-loaded ${allUsers.length} users via SSR`);\n        filterUsers(''); // Show initial users"
      );
      html = html.replace(
        /async function loadUsers\(\) \{[\s\S]*?\}/,
        "async function loadUsers() {\n            // Disabled - users are pre-loaded via SSR for security\n        }"
      );

      reply.type("text/html").send(html);
    } catch (error) {
      console.error("Error rendering page:", error);
      reply.status(500).send({
        error: "Internal server error",
      });
    }
  },
};
