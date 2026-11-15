// JSON API behind the dashboard. Every route requires an admin session.
const { z } = require("zod");
const { Routes } = require("discord.js");
const { HttpError } = require("../../core/errors.js");
const { toJSON } = require("../../core/json.js");
const { scoringSchema, judgeCoverage, parseScoring } = require("../../domain/scoring.js");
const { availableLocales, catalogs } = require("../../i18n/index.js");
const { isSnowflake } = require("../../domain/validation.js");

const id = z.coerce.number().int().positive();
const snowflake = z.string().regex(/^\d{17,20}$/);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const date = z.union([z.string().datetime({ offset: true }), z.null()]).optional();

const eventSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(1024).nullable().optional(),
    imageUrl: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
    status: z.enum(["DRAFT", "RUNNING", "ENDED", "ARCHIVED"]).optional(),
    startsAt: date,
    endsAt: date,
    scoring: scoringSchema.optional(),
  })
  .strict();
const teamSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    emoji: z.string().max(64).nullable().optional(),
    color: hexColor.optional(),
    location: z.string().max(100).nullable().optional(),
  })
  .strict();

function parse(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  return result.data;
}

const toDate = (v) => (v === undefined ? undefined : v === null ? null : new Date(v));

module.exports = async function adminRoutes(app, { services, shardInfo, requireAdmin }) {
  const { store, events, settings, guildConfigs, panels, rest, access, stats, pool, actions } = services;
  app.addHook("preHandler", requireAdmin);

  const changed = () => events.invalidate();
  const bundleOr404 = async (eventId) => {
    const bundle = await events.bundle(eventId);
    if (!bundle) throw new HttpError(404, "Event not found");
    return bundle;
  };
  const actor = (request) => ({ id: request.adminId, name: `dashboard:${request.adminId}` });

  // ---------- session & overview ----------
  app.get("/me", async (request) => ({ userId: request.adminId, owner: access.isOwner(request.adminId) }));

  app.get("/overview", async () => {
    const [counts, shards, list] = await Promise.all([store.counts(), shardInfo().catch(() => []), store.listEvents()]);
    const mem = process.memoryUsage();
    return toJSON({
      uptime: Math.round(process.uptime()),
      memory: { rss: mem.rss, heapUsed: mem.heapUsed },
      node: process.version,
      shards,
      pool: pool.info(),
      counts,
      events: list.map((e) => ({ id: e.id, name: e.name, status: e.status, counts: e._count })),
      locales: availableLocales().map((l) => ({ code: l, name: catalogs[l]["meta.language"] })),
    });
  });

  // ---------- global settings ----------
  app.get("/settings", async () => settings.get());
  app.put("/settings", async (request) => {
    const patch = parse(settings.schema.partial(), request.body);
    // Only the owner may change who else is an admin
    if (patch.admins && !access.isOwner(request.adminId)) throw new HttpError(403, "Only the owner can change admins");
    return settings.update(patch);
  });

  // ---------- servers ----------
  app.get("/guilds", async () => {
    const [botGuilds, configs] = await Promise.all([
      rest.get(Routes.userGuilds()).catch(() => []),
      store.listGuildConfigs(),
    ]);
    const byId = new Map(configs.map((c) => [String(c.id), c]));
    return toJSON(
      botGuilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null,
        config: byId.get(g.id) || null,
      }))
    );
  });

  // Channels and roles for the dropdowns
  app.get("/guilds/:guildId/discord", async (request) => {
    const { guildId } = request.params;
    if (!isSnowflake(guildId)) throw new HttpError(400, "Invalid server ID");
    const [channels, roles] = await Promise.all([
      rest.get(Routes.guildChannels(guildId)),
      rest.get(Routes.guildRoles(guildId)),
    ]);
    return {
      channels: channels
        .filter((c) => [0, 5].includes(c.type))
        .sort((a, b) => a.position - b.position)
        .map((c) => ({ id: c.id, name: c.name })),
      roles: roles
        .filter((r) => r.name !== "@everyone" && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.color })),
    };
  });

  app.put("/guilds/:guildId", async (request) => {
    const { guildId } = request.params;
    if (!isSnowflake(guildId)) throw new HttpError(400, "Invalid server ID");
    const patch = parse(guildConfigs.schema, request.body);
    const guild = await rest.get(Routes.guild(guildId)).catch(() => null);
    return toJSON(await guildConfigs.update(guildId, patch, { name: guild?.name }));
  });

  // ---------- events ----------
  app.get("/events", async () => toJSON(await store.listEvents()));

  app.post("/events", async (request) => {
    const body = parse(eventSchema, request.body);
    const event = await store.createEvent({
      ...body,
      startsAt: toDate(body.startsAt),
      endsAt: toDate(body.endsAt),
      scoring: parseScoring(body.scoring),
    });
    changed();
    return toJSON(event);
  });

  app.get("/events/:id", async (request) => {
    const bundle = await bundleOr404(parse(id, request.params.id));
    const coverage = judgeCoverage(bundle.teams, bundle.judges);
    return toJSON({
      event: { ...bundle.event, scoring: bundle.scoring },
      teams: bundle.teams,
      guilds: bundle.guilds,
      judges: bundle.judges,
      coverage,
    });
  });

  app.put("/events/:id", async (request) => {
    const eventId = parse(id, request.params.id);
    const body = parse(eventSchema.partial(), request.body);
    if (body.status === "RUNNING") {
      const bundle = await bundleOr404(eventId);
      const coverage = judgeCoverage(bundle.teams, bundle.judges);
      if (!coverage.ok) {
        throw new HttpError(409, `At least ${coverage.required} judges are needed: one per team and one neutral judge`);
      }
    }
    const event = await store.updateEvent(eventId, {
      ...body,
      ...(body.startsAt !== undefined ? { startsAt: toDate(body.startsAt) } : {}),
      ...(body.endsAt !== undefined ? { endsAt: toDate(body.endsAt) } : {}),
      ...(body.scoring ? { scoring: parseScoring(body.scoring) } : {}),
    });
    changed();
    return toJSON(event);
  });

  app.delete("/events/:id", async (request) => {
    const eventId = parse(id, request.params.id);
    if (request.body?.confirm !== `delete ${eventId}`) throw new HttpError(400, `Confirm with "delete ${eventId}"`);
    await store.deleteEvent(eventId);
    changed();
    return { ok: true };
  });

  // ---------- teams ----------
  app.post("/events/:id/teams", async (request) => {
    const eventId = parse(id, request.params.id);
    const team = await store.createTeam({ eventId, ...parse(teamSchema, request.body) });
    changed();
    return team;
  });
  app.put("/teams/:teamId", async (request) => {
    const team = await store.updateTeam(parse(id, request.params.teamId), parse(teamSchema.partial(), request.body));
    changed();
    return team;
  });
  app.delete("/teams/:teamId", async (request) => {
    await store.deleteTeam(parse(id, request.params.teamId));
    changed();
    return { ok: true };
  });

  // ---------- servers in an event ----------
  app.put("/events/:id/guilds/:guildId", async (request) => {
    const eventId = parse(id, request.params.id);
    const { guildId } = request.params;
    if (!isSnowflake(guildId)) throw new HttpError(400, "Invalid server ID");
    const { teamId } = parse(z.object({ teamId: id.nullable() }), request.body);
    const bundle = await bundleOr404(eventId);
    if (teamId && !bundle.team(teamId)) throw new HttpError(400, "Team does not belong to this event");
    const guild = await rest.get(Routes.guild(guildId)).catch(() => null);
    await store.upsertGuildConfig(guildId, guild ? { name: guild.name } : {});
    const link = await store.linkGuild(eventId, guildId, teamId);
    changed();
    return toJSON(link);
  });
  app.delete("/events/:id/guilds/:guildId", async (request) => {
    await store.unlinkGuild(parse(id, request.params.id), request.params.guildId);
    changed();
    return { ok: true };
  });

  // ---------- judges ----------
  app.post("/events/:id/judges", async (request) => {
    const eventId = parse(id, request.params.id);
    const body = parse(z.object({ userId: snowflake, teamId: id.nullable() }), request.body);
    const bundle = await bundleOr404(eventId);
    if (body.teamId && !bundle.team(body.teamId)) throw new HttpError(400, "Team does not belong to this event");
    const user = await rest.get(Routes.user(body.userId)).catch(() => null);
    const judge = await store.addJudge({
      eventId,
      userId: body.userId,
      teamId: body.teamId,
      displayName: user ? user.global_name || user.username : null,
    });
    changed();
    return toJSON(judge);
  });
  app.delete("/judges/:judgeId", async (request) => {
    await store.removeJudge(parse(id, request.params.judgeId));
    changed();
    return { ok: true };
  });

  // ---------- participants ----------
  app.get("/events/:id/participants", async (request) =>
    toJSON(await store.listParticipants(parse(id, request.params.id)))
  );
  app.put("/participants/:participantId", async (request) => {
    const body = parse(
      z.object({
        banned: z.boolean().optional(),
        teamId: id.nullable().optional(),
        minecraftName: z.string().regex(/^[A-Za-z0-9_]{3,16}$/).optional(),
      }).strict(),
      request.body
    );
    const participant = await store.updateParticipant(parse(id, request.params.participantId), body);
    stats.invalidate(participant.eventId);
    return toJSON(participant);
  });

  // GDPR erasure request: removes the participant, their builds, panels and images
  app.delete("/participants/:participantId", async (request) => {
    const participantId = parse(id, request.params.participantId);
    const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(500) }), request.body);
    const { participant, builds } = await store.deleteParticipant(participantId);
    await Promise.allSettled(builds.map((b) => panels.removeMessages(b)));
    await Promise.allSettled(builds.flatMap((b) => b.images).map((url) => services.storage.remove(url)));
    stats.invalidate(participant.eventId);
    // Logged without personal data
    await store.logActivity({ eventId: participant.eventId, type: "PARTICIPANT_ERASED", actor: actor(request).name, details: `Reason: ${reason}` });
    return { ok: true, builds: builds.length };
  });

  // ---------- builds ----------
  app.get("/events/:id/builds", async (request) => {
    const eventId = parse(id, request.params.id);
    const { status, page = 0 } = request.query || {};
    const statuses = ["PENDING", "IN_REVIEW", "COMPLETE", "REJECTED"];
    const builds = await store.listBuilds(eventId, {
      status: statuses.includes(status) ? status : undefined,
      take: 50,
      skip: Math.max(0, Number(page) || 0) * 50,
    });
    return toJSON(builds);
  });
  app.delete("/builds/:buildId", async (request) => {
    const buildId = parse(id, request.params.buildId);
    const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(500) }), request.body);
    const build = await store.getBuild(buildId);
    if (!build) throw new HttpError(404, "Build not found");
    await actions.remove({ bundle: await bundleOr404(build.eventId), buildId, user: actor(request), reason });
    return { ok: true };
  });
  app.post("/builds/:buildId/refresh", async (request) => {
    const buildId = parse(id, request.params.buildId);
    const build = await store.getBuild(buildId);
    if (!build) throw new HttpError(404, "Build not found");
    await actions.settle(await bundleOr404(build.eventId), buildId);
    return panels.refresh(buildId);
  });

  // ---------- leaderboard, activity ----------
  app.get("/events/:id/leaderboard", async (request) => {
    const bundle = await bundleOr404(parse(id, request.params.id));
    stats.invalidate(bundle.event.id);
    return toJSON(await stats.leaderboard(bundle));
  });
  app.get("/activity", async (request) => {
    const { eventId, before, limit } = request.query || {};
    return toJSON(
      await store.listActivity({
        eventId: eventId ? Number(eventId) : undefined,
        before: before ? Number(before) : undefined,
        limit: Number(limit) || 100,
      })
    );
  });

  // ---------- actions ----------
  app.post("/events/:id/announce", async (request) => {
    const eventId = parse(id, request.params.id);
    const { kind } = parse(z.object({ kind: z.enum(["start", "end", "wrapup"]) }), request.body);
    await bundleOr404(eventId);
    return { posted: await panels.announce(eventId, kind) };
  });
  app.post("/events/:id/boards", async (request) => {
    const eventId = parse(id, request.params.id);
    await bundleOr404(eventId);
    return { updated: await panels.updateBoards(eventId) };
  });
  // Re-evaluates every build, e.g. after teams or scoring rules changed
  app.post("/events/:id/recalculate", async (request) => {
    const bundle = await bundleOr404(parse(id, request.params.id));
    const builds = await store.listBuilds(bundle.event.id, {});
    for (const b of builds) await actions.settle(bundle, b.id);
    return { builds: builds.length };
  });

  // ---------- danger zone ----------
  app.post("/events/:id/clear-builds", async (request) => {
    const eventId = parse(id, request.params.id);
    if (request.body?.confirm !== `clear ${eventId}`) throw new HttpError(400, `Confirm with "clear ${eventId}"`);
    await store.clearEventBuilds(eventId);
    stats.invalidate(eventId);
    await store.logActivity({ eventId, type: "DATABASE_CLEARED", actor: actor(request).name });
    return { ok: true };
  });
  app.post("/storage/clear", async (request) => {
    if (request.body?.confirm !== "clear images") throw new HttpError(400, 'Confirm with "clear images"');
    return services.storage.clear();
  });
};
