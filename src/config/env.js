// Only secrets and deployment details live in the environment.
// Everything else (channels, events, teams, judges, storage, webhook, ...) is
// configured in the dashboard and stored in the database.
const path = require("path");
const { z } = require("zod");

require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });

const DEFAULT_OWNER_ID = "804386907244462141";

const schema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.coerce.number().int().min(1).max(65535).default(6969),
  PUBLIC_URL: z.string().url().optional(),
  OWNER_ID: z.string().regex(/^\d{17,20}$/).default(DEFAULT_OWNER_ID),
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  SHARDS: z.union([z.literal("auto"), z.coerce.number().int().min(1)]).default("auto"),
  WORKER_THREADS: z.coerce.number().int().min(1).max(64).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

function parseEnv(source = process.env) {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== "")
  );
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const env = result.data;
  return { ...env, PUBLIC_URL: (env.PUBLIC_URL || `http://localhost:${env.PORT}`).replace(/\/$/, "") };
}

let cached;
function getEnv() {
  if (!cached) cached = parseEnv();
  return cached;
}

module.exports = { getEnv, parseEnv, DEFAULT_OWNER_ID };
