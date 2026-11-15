// HTTP server: the public API (unchanged), dashboard login and the dashboard itself
const fs = require("fs");
const path = require("path");
const Fastify = require("fastify");
const cors = require("@fastify/cors");
const { HttpError } = require("../core/errors.js");
const { verifyToken, createSessionToken, createNonceRegistry, parseCookies, SESSION_TTL_MS } = require("./auth.js");

const PUBLIC_DIR = path.join(__dirname, "public");
const COOKIE = "eventbot_session";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

async function createServer({ services, shardInfo = async () => [], logger = false }) {
  const app = Fastify({ logger, bodyLimit: 256 * 1024 });
  const nonces = createNonceRegistry();
  const secure = services.env.PUBLIC_URL.startsWith("https://");

  app.setErrorHandler((err, request, reply) => {
    const status = err instanceof HttpError ? err.statusCode : err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) services.log.error(`${request.method} ${request.url} failed:`, err);
    reply.status(status).send({ error: status >= 500 ? "Internal error" : err.message });
  });

  // CORS only for the public API, as before; the dashboard API never sends credentials cross-site
  await app.register(async (scope) => {
    await scope.register(cors, { origin: true, methods: ["GET", "POST", "PUT", "DELETE"] });
    await scope.register(require("./routes/public.js"), { services });
  });

  async function requireAdmin(request) {
    const secret = await services.settings.sessionSecret();
    const session = verifyToken(secret, parseCookies(request.headers.cookie)[COOKIE], { type: "session" });
    if (!session || !(await services.access.isAdmin(session.uid))) throw new HttpError(401, "Not logged in");
    // Simple CSRF guard on top of the SameSite cookie
    if (request.method !== "GET" && request.headers["x-requested-with"] !== "dashboard") {
      throw new HttpError(403, "Missing X-Requested-With header");
    }
    request.adminId = session.uid;
  }

  app.get("/auth/login", async (request, reply) => {
    const secret = await services.settings.sessionSecret();
    const login = verifyToken(secret, request.query?.token, { type: "login" });
    if (!login || !nonces.consume(login.n, login.exp) || !(await services.access.isAdmin(login.uid))) {
      return reply.status(401).type("text/html").send(
        "<!doctype html><meta charset=utf-8><title>Login failed</title><body style=\"font-family:system-ui;padding:3rem\"><h1>Link invalid or expired</h1><p>Run <code>/dashboard</code> in Discord to get a new one.</p>"
      );
    }
    const session = createSessionToken(secret, login.uid);
    reply.header(
      "set-cookie",
      `${COOKIE}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`
    );
    services.log.info(`Dashboard login by ${login.uid}`);
    return reply.redirect("/admin/");
  });

  app.post("/auth/logout", async (request, reply) => {
    reply.header("set-cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    return { ok: true };
  });

  await app.register(require("./routes/admin.js"), { prefix: "/admin/api", services, shardInfo, requireAdmin });

  // Static dashboard files (no build step)
  app.get("/", async (request, reply) => reply.redirect("/admin/"));
  app.get("/admin", async (request, reply) => reply.redirect("/admin/"));
  app.get("/admin/*", async (request, reply) => {
    const rel = request.params["*"] || "index.html";
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return reply.type(MIME[".html"]).send(fs.createReadStream(path.join(PUBLIC_DIR, "index.html")));
    }
    reply.header("cache-control", "no-cache");
    return reply.type(MIME[path.extname(file)] || "application/octet-stream").send(fs.createReadStream(file));
  });

  return app;
}

module.exports = { createServer, COOKIE };
