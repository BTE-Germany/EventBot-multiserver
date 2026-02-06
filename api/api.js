const Fastify = require("fastify");
const cors = require("@fastify/cors");
const path = require("path");
const fs = require("fs");

module.exports = {
  start: async () => {
    const fastify = Fastify();
    
    // Register static file serving for web interface
    await fastify.register(require("@fastify/static"), {
      root: path.join(__dirname, "public"),
      prefix: "/static",
    });

    const routeFiles = fs
      .readdirSync("./api/endpoint")
      .filter((file) => file.endsWith(".js"));
    for (const file of routeFiles) {
      let data = require(`./endpoint/${file}`);
      console.log(
        new Date().toLocaleString(),
        `Route registriert: /${data.method} ${data.path}`
      );
      fastify.route(data);
    }

    //double register for /static
    let grant_booster = require("./endpoint/grant_booster.js");
    let get_users = require("./endpoint/get_users.js");
    grant_booster.path = "/static" + grant_booster.path;
    get_users.path = "/static" + get_users.path;
    console.log(
      new Date().toLocaleString(),
      `Route registriert: /${grant_booster.method} ${grant_booster.path}`
    );
    console.log(
      new Date().toLocaleString(),
      `Route registriert: /${get_users.method} ${get_users.path}`
    )
    fastify.route(grant_booster);
    fastify.route(get_users);

    fastify.register(cors, {
      origin: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
    });
    await fastify.listen({ port: process.env.PORT, host: "0.0.0.0" });
  },
};
