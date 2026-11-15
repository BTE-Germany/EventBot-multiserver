// Global settings, edited in the dashboard and stored in the database.
// Cached per thread; the bus tells every thread when they change.
const crypto = require("crypto");
const { z } = require("zod");
const { createCache } = require("../core/cache.js");
const { TOPICS } = require("../core/bus.js");

const snowflake = z.string().regex(/^\d{17,20}$/, "must be a Discord ID");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a hex color like #5865F2");

const settingsSchema = z
  .object({
    // Users who may open the dashboard in addition to OWNER_ID
    admins: z.array(snowflake).max(50).default([]),
    defaultLocale: z.string().default("en-US"),
    brandColor: hexColor.default("#D0FF00"),
    storage: z
      .object({
        cdnUrl: z.string().url().or(z.literal("")).default(""),
        container: z.string().max(63).default(""),
        // Blobs below this prefix survive "clear images"
        keepPrefix: z.string().default("keep/"),
      })
      .default({}),
    // Receives the event stats as JSON every minute; empty disables it
    webhookUrl: z.string().url().or(z.literal("")).default(""),
    boardIntervalMinutes: z.number().int().min(1).max(60).default(5),
    // Operator details for the built-in Privacy Policy and Terms (src/legal)
    legal: z
      .object({
        // Changing the version makes everyone accept the terms again
        version: z.string().trim().regex(/^[\w.-]{1,40}$/, "letters, digits, . _ - only").default("2026-11-15"),
        operatorName: z.string().max(200).default("Michael Reimchen"),
        operatorAddress: z.string().max(300).default("Alfred-Fried-Straße 1, 91074 Herzogenaurach, Germany"),
        operatorEmail: z.string().email().or(z.literal("")).default("michael@mic-r.eu"),
        hostingProvider: z.string().max(200).default(""),
        retentionMonths: z.number().int().min(1).max(60).default(12),
        imprintUrl: z.string().url().or(z.literal("")).default("https://legal.mic-r.eu/imprint.html"),
        // Optional external copies; by default the bot serves /legal/privacy and /legal/terms itself
        privacyUrl: z.string().url().or(z.literal("")).default(""),
        termsUrl: z.string().url().or(z.literal("")).default(""),
      })
      .default({}),
  })
  .strict();

const DEFAULTS = settingsSchema.parse({});
const KEY = "global";

function createSettingsService({ store, bus }) {
  const cache = createCache({ ttlMs: 60000 });
  bus?.subscribe(({ topic, payload }) => {
    if (topic === TOPICS.CONFIG && payload.scope === "settings") cache.clear();
  });

  const load = async () => settingsSchema.parse({ ...(await store.getSetting(KEY)) });

  return {
    schema: settingsSchema,
    get: () => cache.get(KEY, load),
    async update(patch) {
      const current = await load();
      const next = settingsSchema.parse({
        ...current,
        ...patch,
        ...(patch.legal ? { legal: { ...current.legal, ...patch.legal } } : {}),
        ...(patch.storage ? { storage: { ...current.storage, ...patch.storage } } : {}),
      });
      await store.setSetting(KEY, next);
      cache.delete(KEY);
      bus?.publish(TOPICS.CONFIG, { scope: "settings" });
      return next;
    },
    // Signs dashboard logins; generated once and kept in the database, so it never needs to be in .env
    async sessionSecret() {
      return cache.get("sessionSecret", async () => {
        let secret = await store.getSetting("sessionSecret");
        if (!secret) {
          secret = crypto.randomBytes(48).toString("base64url");
          await store.setSetting("sessionSecret", secret);
        }
        return secret;
      });
    },
  };
}

module.exports = { createSettingsService, settingsSchema, DEFAULTS };
