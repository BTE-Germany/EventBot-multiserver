// Shared autocomplete sources
const { scoreSteps } = require("../domain/scoring.js");
const { statusLabel, truncate } = require("./views/format.js");
const { teamLabel } = require("../services/events.js");

async function respondBuilds(ctx, { statuses, mySlot = false } = {}) {
  const bundle = await ctx.event();
  if (!bundle) return ctx.interaction.respond([]);
  const builds = await ctx.services.store.searchBuilds(bundle.event.id, {
    query: ctx.interaction.options.getFocused(),
    statuses,
    missingSlot: mySlot ? bundle.judgeSlot(ctx.user.id) || undefined : undefined,
  });
  const choices = builds
    .filter((b) => !mySlot || String(b.builderId) !== String(ctx.user.id))
    .slice(0, 25)
    .map((b) => ({
      name: truncate(`#${b.id} · ${statusLabel(b.status, ctx.t)} · ${b.location}`, 100),
      value: b.id,
    }));
  return ctx.interaction.respond(choices);
}

async function respondScores(ctx) {
  const bundle = await ctx.event();
  if (!bundle) return ctx.interaction.respond([]);
  const focused = ctx.interaction.options.getFocused(true);
  const typed = String(focused.value || "").replace(",", ".");
  const s = bundle.scoring;
  let values;
  if (focused.name === "base") {
    values = s.baseOptions.map((v) => ({
      name: [0, 1, 2].includes(v) ? `${ctx.t.number(v)} · ${ctx.t(`categories.base${v}`)}` : ctx.t.number(v),
      value: v,
    }));
  } else {
    const max = focused.name === "effort" ? s.effortMax : s.detailMax;
    values = scoreSteps(max, s.step).map((v) => ({ name: `${ctx.t.number(v)} / ${ctx.t.number(max)}`, value: v }));
  }
  const filtered = typed ? values.filter((c) => String(c.value).startsWith(typed)) : values;
  return ctx.interaction.respond(filtered.slice(0, 25));
}

async function respondTeams(ctx) {
  const bundle = await ctx.event();
  if (!bundle) return ctx.interaction.respond([]);
  const typed = String(ctx.interaction.options.getFocused() || "").toLowerCase();
  return ctx.interaction.respond(
    bundle.teams
      .filter((team) => team.name.toLowerCase().includes(typed))
      .slice(0, 25)
      .map((team) => ({ name: truncate(teamLabel(team), 100), value: team.id }))
  );
}

module.exports = { respondBuilds, respondScores, respondTeams };
