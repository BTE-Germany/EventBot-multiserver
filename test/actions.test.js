const test = require("node:test");
const assert = require("node:assert/strict");
const { IDS, TERMS, seedBattle, user, attachment } = require("./helpers/fixtures.js");
const { UserError } = require("../src/core/errors.js");

const rejectsWith = (promise, key) =>
  assert.rejects(promise, (err) => {
    assert.ok(err instanceof UserError, `expected UserError, got ${err}`);
    assert.equal(err.key, key);
    return true;
  });

async function registered(ctx) {
  const { actions, bundle } = ctx;
  const de = await actions.register({ acceptedTermsVersion: TERMS, bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), minecraftName: "Lübecker_1".replace("ü", "ue") });
  const pl = await actions.register({ acceptedTermsVersion: TERMS, bundle, guildId: IDS.guildPL, user: user(IDS.builderPL), minecraftName: "Opolanin" });
  return { de, pl };
}

async function submitted(ctx, userId = IDS.builderDE, guildId = IDS.guildDE) {
  return ctx.actions.submit({
    bundle: ctx.bundle,
    guildId,
    user: user(userId),
    location: "53.8655, 10.6866",
    referenceType: "3d",
    referenceLink: "https://earth.google.com/web/@53.86",
    area: 180,
    attachments: [attachment(1), attachment(2)],
  });
}

const values = (basePoints, effort, detail) => ({ basePoints, effort, detail });

test("registration: the server you register on is your team", async () => {
  const ctx = await seedBattle();
  const { de, pl } = await registered(ctx);
  assert.equal(de.team.name, "Germany");
  assert.equal(pl.team.name, "Poland");
  assert.equal(pl.participant.teamId, ctx.teams.poland.id);

  await rejectsWith(ctx.actions.register({ acceptedTermsVersion: TERMS, bundle: ctx.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), minecraftName: "Other" }), "register.already");
  await rejectsWith(ctx.actions.register({ acceptedTermsVersion: TERMS, bundle: ctx.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE2), minecraftName: "opolanin" }), "register.nameTaken");
  await rejectsWith(ctx.actions.register({ acceptedTermsVersion: TERMS, bundle: ctx.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE2), minecraftName: "no" }), "register.invalidName");
  // Neutral servers have no team, so nobody can register there, and a team can't be picked
  await rejectsWith(ctx.actions.register({ acceptedTermsVersion: TERMS, bundle: ctx.bundle, guildId: IDS.guildNeutral, user: user(IDS.builderDE2), minecraftName: "Neutral1", teamId: ctx.teams.poland.id }), "register.teamServerOnly");
  // Registering on the Polish server makes you Polish, whatever else is passed
  const polish = await ctx.actions.register({ acceptedTermsVersion: TERMS, bundle: ctx.bundle, guildId: IDS.guildPL, user: user(IDS.builderDE2), minecraftName: "Neutral1", teamId: ctx.teams.germany.id });
  assert.equal(polish.team.name, "Poland");
  // Builds belong to the registration team even when submitted on another server
  const { build } = await submitted(ctx, IDS.builderDE2, IDS.guildDE);
  assert.equal(build.teamId, ctx.teams.poland.id);
});

test("a screenshot is required; YouTube and imgur links are extras", async () => {
  const ctx = await seedBattle();
  await registered(ctx);
  const base = { bundle: ctx.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), location: "x", referenceType: "3d", referenceLink: "https://earth.google.com/x" };

  // No upload: the direct imgur image counts as screenshot, the video and album become buttons
  const { build } = await ctx.actions.submit({
    ...base,
    mediaLinks: ["https://youtu.be/dQw4w9WgXcQ", "https://i.imgur.com/AbC123x.png", "https://imgur.com/a/AbC123x", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  });
  assert.deepEqual(build.images, ["https://i.imgur.com/AbC123x.png"]);
  assert.deepEqual(build.media, ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://imgur.com/a/AbC123x"]);

  await rejectsWith(ctx.actions.submit({ ...base, mediaLinks: ["https://example.org/video"] }), "submit.invalidMedia");
  await rejectsWith(ctx.actions.submit({ ...base, attachments: [], mediaLinks: [] }), "submit.imageRequired");
  // A video or album alone is not enough
  await rejectsWith(ctx.actions.submit({ ...base, mediaLinks: ["https://youtu.be/dQw4w9WgXcQ", "https://imgur.com/a/AbC123x"] }), "submit.imageRequired");
  const combined = await ctx.actions.submit({ ...base, attachments: [attachment(1)], mediaLinks: ["https://youtube.com/shorts/dQw4w9WgXcQ"] });
  assert.equal(combined.build.images.length, 1);
  assert.equal(combined.build.media.length, 1);
});

test("judges count for their team but cannot score or correct their own builds", async () => {
  const ctx = await seedBattle();
  await registered(ctx);
  // The German judge also builds for Germany
  await ctx.actions.register({ acceptedTermsVersion: TERMS, bundle: ctx.bundle, guildId: IDS.guildDE, user: user(IDS.judgeDE), minecraftName: "JudgeBuilder" });
  const { build } = await submitted(ctx, IDS.judgeDE);
  await rejectsWith(ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgeDE), values: values(2, 6, 10) }), "judge.ownBuild");
  for (const judge of [IDS.judgeDE2, IDS.judgePL, IDS.judgeNeutral]) {
    await ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(judge), values: values(2, 4, 6) });
  }
  await rejectsWith(ctx.actions.correct({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgeDE), reason: "more", values: { detail: 10 } }), "judge.ownBuild");
  await rejectsWith(ctx.actions.reject({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgeDE), reason: "x" }), "judge.ownBuild");

  const lb = await ctx.stats.leaderboard(ctx.bundle);
  const germany = lb.teams.find((t) => t.name === "Germany");
  assert.equal(germany.points, 12, "the judge's points count for Germany");
  assert.equal(lb.ranking.some((p) => p.userId === IDS.judgeDE), false, "but the judge cannot win");
});

test("submission validates input and publishes the panels", async () => {
  const ctx = await seedBattle();
  await rejectsWith(submitted(ctx), "common.notRegistered");
  await registered(ctx);
  const { build } = await submitted(ctx);
  assert.equal(build.status, "PENDING");
  assert.equal(build.teamId, ctx.teams.germany.id);
  assert.equal(build.images.length, 2);
  assert.equal(build.area, 180);
  assert.deepEqual(ctx.calls.publish, [build.id]);

  const base = { bundle: ctx.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), location: "x", referenceType: "3d", attachments: [attachment()] };
  await rejectsWith(ctx.actions.submit({ ...base, referenceLink: "not a link" }), "submit.invalidLink");
  await rejectsWith(ctx.actions.submit({ ...base, referenceLink: "https://x.y", area: -5 }), "submit.invalidArea");
  await rejectsWith(ctx.actions.submit({ ...base, referenceLink: "https://x.y", attachments: [] }), "submit.imageRequired");

  const participant = await ctx.store.findParticipant(ctx.event.id, IDS.builderDE);
  await ctx.store.updateParticipant(participant.id, { banned: true });
  await rejectsWith(submitted(ctx), "common.banned");
});

test("submissions are only accepted during the building phase", async () => {
  const ctx = await seedBattle({ startsAt: new Date("2027-01-01T00:00:00Z"), endsAt: new Date("2027-01-08T00:00:00Z") });
  await registered(ctx); // registration is already open before the start
  await rejectsWith(submitted(ctx), "phase.submitClosed");
});

test("full judging: one vote per team plus neutral, then points are awarded", async () => {
  const ctx = await seedBattle();
  await registered(ctx);
  const { build } = await submitted(ctx);
  const vote = (judgeId, v) => ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(judgeId), values: v });

  const first = await vote(IDS.judgeDE, values(2, 4, 6));
  assert.equal(first.build.status, "IN_REVIEW");
  assert.equal(first.done, 1);
  assert.equal(first.required, 3);

  // The second German judge cannot fill the German slot again
  await rejectsWith(vote(IDS.judgeDE2, values(2, 5, 5)), "judge.slotTaken");

  const second = await vote(IDS.judgePL, values(2, 5, 7));
  assert.equal(second.build.status, "IN_REVIEW");
  let participant = await ctx.store.findParticipant(ctx.event.id, IDS.builderDE);
  assert.equal(participant.points, 0, "no points before every slot voted");

  const third = await vote(IDS.judgeNeutral, values(1, 3, 8));
  assert.equal(third.completedNow, true);
  assert.equal(third.build.status, "COMPLETE");
  assert.equal(third.build.basePoints, 2); // majority of 2, 2, 1
  assert.equal(third.build.effort, 4);
  assert.equal(third.build.detail, 7);
  assert.equal(third.build.total, 13);
  participant = await ctx.store.findParticipant(ctx.event.id, IDS.builderDE);
  assert.equal(participant.points, 13);

  // A judge may change their own vote; points follow
  const updated = await vote(IDS.judgeNeutral, values(2, 6, 8));
  assert.equal(updated.update, true);
  assert.equal(updated.build.effort, 5);
  participant = await ctx.store.findParticipant(ctx.event.id, IDS.builderDE);
  assert.equal(participant.points, 14); // 2 + avg(4,5,6) + avg(6,7,8)

  const types = ctx.store.db.activity.map((a) => a.type);
  assert.ok(types.includes("COMPLETED"));
  assert.ok(ctx.calls.refresh.includes(build.id));
});

test("judges cannot judge their own builds; non-judges cannot judge", async () => {
  const ctx = await seedBattle();
  await ctx.actions.register({ acceptedTermsVersion: TERMS, bundle: ctx.bundle, guildId: IDS.guildDE, user: user(IDS.judgeDE), minecraftName: "JudgeBuilder" });
  const { build } = await submitted(ctx, IDS.judgeDE);
  await rejectsWith(ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgeDE), values: values(2, 1, 1) }), "judge.ownBuild");
  // ...but the other German judge can cover the slot
  const ok = await ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgeDE2), values: values(2, 1, 1) });
  assert.equal(ok.done, 1);
  await rejectsWith(ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.builderPL), values: values(2, 1, 1) }), "common.notJudge");
  await rejectsWith(ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgePL), values: values(5, 1, 1) }), "judge.invalidBase");
  await rejectsWith(ctx.actions.vote({ bundle: ctx.bundle, buildId: 999, user: user(IDS.judgePL), values: values(2, 1, 1) }), "common.buildNotFound");
});

test("rejection removes points; resubmission clears votes and restarts judging", async () => {
  const ctx = await seedBattle();
  await registered(ctx);
  const { build } = await submitted(ctx);
  for (const judge of [IDS.judgeDE, IDS.judgePL, IDS.judgeNeutral]) {
    await ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(judge), values: values(2, 4, 6) });
  }
  assert.equal((await ctx.store.findParticipant(ctx.event.id, IDS.builderDE)).points, 12);

  await rejectsWith(ctx.actions.reject({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.builderPL), reason: "x" }), "common.notJudge");
  const rejected = await ctx.actions.reject({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgePL), reason: "Front yard missing" });
  assert.equal(rejected.build.status, "REJECTED");
  assert.equal(rejected.build.rejectReason, "Front yard missing");
  assert.equal((await ctx.store.findParticipant(ctx.event.id, IDS.builderDE)).points, 0);
  await rejectsWith(ctx.actions.reject({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgePL), reason: "again" }), "reject.already");
  await rejectsWith(ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgeDE2), values: values(2, 4, 6) }), "judge.rejected");

  await rejectsWith(ctx.actions.resubmit({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.builderPL) }), "common.notOwner");
  const again = await ctx.actions.resubmit({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.builderDE), note: "Added the front yard" });
  assert.equal(again.build.status, "PENDING");
  assert.equal(again.build.votes.length, 0);
  assert.match(again.build.extraInfo, /front yard/);
  await rejectsWith(ctx.actions.resubmit({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.builderDE) }), "resubmit.notRejected");
});

test("corrections override single categories and are logged", async () => {
  const ctx = await seedBattle();
  await registered(ctx);
  const { build } = await submitted(ctx);
  await rejectsWith(ctx.actions.correct({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgePL), reason: "r", values: { basePoints: 1 } }), "correct.notJudged");
  for (const judge of [IDS.judgeDE, IDS.judgePL, IDS.judgeNeutral]) {
    await ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(judge), values: values(2, 4, 6) });
  }
  await rejectsWith(ctx.actions.correct({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgePL), reason: "r", values: {} }), "correct.nothing");
  const result = await ctx.actions.correct({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.judgePL), reason: "Only infrastructure", values: { basePoints: 1, effort: null } });
  assert.equal(result.oldTotal, 12);
  assert.equal(result.evaluation.total, 11);
  assert.equal(result.build.override.reason, "Only infrastructure");
  assert.equal((await ctx.store.findParticipant(ctx.event.id, IDS.builderDE)).points, 11);
  assert.ok(ctx.store.db.activity.some((a) => a.type === "CORRECTED" && a.details.includes("12 → 11")));
});

test("deleting a build removes its points, panels and images; admins may act too", async () => {
  const ctx = await seedBattle();
  await registered(ctx);
  const { build } = await submitted(ctx);
  for (const judge of [IDS.judgeDE, IDS.judgePL, IDS.judgeNeutral]) {
    await ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(judge), values: values(2, 4, 6) });
  }
  const { pointChange } = await ctx.actions.remove({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.admin), reason: "Outside the event area" });
  assert.equal(pointChange.delta, -12);
  assert.equal(await ctx.store.getBuild(build.id), undefined);
  assert.deepEqual(ctx.calls.removeMessages, [build.id]);
  assert.equal(ctx.calls.removedImages.length, 2);
});

test("leaderboard and profile reflect the judging", async () => {
  const ctx = await seedBattle();
  await registered(ctx);
  const { build } = await submitted(ctx);
  await submitted(ctx, IDS.builderPL, IDS.guildPL);
  for (const judge of [IDS.judgeDE, IDS.judgePL, IDS.judgeNeutral]) {
    await ctx.actions.vote({ bundle: ctx.bundle, buildId: build.id, user: user(judge), values: values(2, 5, 9) });
  }
  const lb = await ctx.stats.leaderboard(ctx.bundle);
  assert.equal(lb.winner.name, "Germany");
  assert.equal(lb.totals.builds, 1);
  assert.equal(lb.totals.pending, 1);
  assert.equal(lb.teams.find((t) => t.name === "Germany").area, 180);

  const profile = await ctx.stats.profile(ctx.bundle, IDS.builderDE);
  assert.equal(profile.player.rank, 1);
  assert.equal(profile.player.points, 16);
  assert.deepEqual(profile.averages, { basePoints: 2, effort: 5, detail: 9 });
  assert.equal(profile.best.id, build.id);
  assert.equal(await ctx.stats.profile(ctx.bundle, "123456789012345678"), null);
});

test("builder notes can only be set by the owner", async () => {
  const ctx = await seedBattle();
  await registered(ctx);
  const { build } = await submitted(ctx);
  await rejectsWith(ctx.actions.setInfo({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.builderPL), text: "x" }), "common.notOwner");
  await ctx.actions.setInfo({ bundle: ctx.bundle, buildId: build.id, user: user(IDS.builderDE), text: " Half-timbered, with interior " });
  assert.equal((await ctx.store.getBuild(build.id)).extraInfo, "Half-timbered, with interior");
});

test("registration needs the current Terms of Service; changed terms must be accepted again", async () => {
  const ctx = await seedBattle();
  const base = { bundle: ctx.bundle, guildId: IDS.guildDE, user: user(IDS.builderDE), minecraftName: "Anna" };

  // /register only validates and returns what the consent dialog needs
  const check = await ctx.actions.checkRegistration(base);
  assert.equal(check.mode, "new");
  assert.equal(check.termsVersion, TERMS);
  assert.equal(await ctx.store.findParticipant(ctx.event.id, IDS.builderDE), null, "nothing saved before accepting");

  await rejectsWith(ctx.actions.register({ ...base, acceptedTermsVersion: "old" }), "legal.reaccept");
  const { participant } = await ctx.actions.register({ ...base, acceptedTermsVersion: TERMS });
  assert.equal(participant.termsVersion, TERMS);
  assert.ok(participant.termsAcceptedAt instanceof Date);
  await rejectsWith(ctx.actions.checkRegistration(base), "register.already");

  // New terms: submitting is blocked until they are accepted again
  await ctx.settings.update({ legal: { version: "2027-01-01" } });
  await rejectsWith(submitted(ctx), "legal.reaccept");
  const again = await ctx.actions.checkRegistration({ ...base, minecraftName: null });
  assert.equal(again.mode, "reaccept");
  const result = await ctx.actions.register({ ...base, minecraftName: null, acceptedTermsVersion: "2027-01-01" });
  assert.equal(result.updated, true);
  assert.equal(result.participant.termsVersion, "2027-01-01");
  assert.equal((await submitted(ctx)).build.status, "PENDING");
  assert.ok(ctx.store.db.activity.some((a) => a.type === "TERMS_ACCEPTED"));
});
