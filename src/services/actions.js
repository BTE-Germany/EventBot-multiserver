// What users and judges do: register, submit, vote, reject, resubmit, correct,
// delete. Every method validates, writes through the store, recalculates
// points and returns a result; failures the user should see are UserErrors.
// Discord specifics (panels, DMs) are injected, so this runs against an
// in-memory store in the tests.
const { UserError } = require("../core/errors.js");
const { SlotTakenError } = require("../db/store.js");
const {
  validateVote,
  checkJudgeEligibility,
  evaluateBuild,
  requiredSlots,
  round2,
} = require("../domain/scoring.js");
const { canRegister, canSubmit, canJudge } = require("../domain/eventWindow.js");
const { isMinecraftName, isUrl, parseArea, splitMedia, REFERENCE_TYPES } = require("../domain/validation.js");

const MAX_MEDIA_LINKS = 5;

const ACTIVITY = {
  REGISTERED: "REGISTERED",
  BUILD_CREATED: "BUILD_CREATED",
  VOTED: "VOTED",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
  RESUBMITTED: "RESUBMITTED",
  CORRECTED: "CORRECTED",
  DELETED: "DELETED",
  INFO: "INFO",
  TERMS_ACCEPTED: "TERMS_ACCEPTED",
};

function createActionService({ store, panels, images, stats, access, settings, log, now = () => new Date() }) {
  // Version of the Terms of Service users must have accepted (dashboard setting)
  const currentTermsVersion = async () => (await settings.get()).legal.version;
  const background = (promise, what) => Promise.resolve(promise).catch((err) => log?.warn(`${what} failed:`, err.message));

  async function loadBuild(bundle, buildId) {
    const build = await store.getBuild(buildId);
    if (!build || build.eventId !== bundle.event.id) throw new UserError("common.buildNotFound", { id: buildId });
    return build;
  }

  async function requireJudgeOrAdmin(bundle, userId) {
    if (bundle.isJudge(userId) || (await access.isAdmin(userId))) return;
    throw new UserError("common.notJudge");
  }

  // Recomputes a build from its votes and corrections and the builder's points
  async function settle(bundle, buildId) {
    const build = await store.getBuild(buildId);
    const evaluation = evaluateBuild({ build, votes: build.votes, teams: bundle.teams, scoring: bundle.scoring });
    const updated = await store.updateBuild(buildId, {
      status: evaluation.status,
      basePoints: evaluation.basePoints,
      effort: evaluation.effort,
      detail: evaluation.detail,
      total: evaluation.total,
      completedAt: evaluation.status === "COMPLETE" ? build.completedAt || now() : null,
    });
    const pointChange = await store.recalculateParticipant(build.participantId);
    stats?.invalidate(bundle.event.id);
    return { build: updated, evaluation, pointChange };
  }

  const refreshPanels = (buildId) => background(panels?.refresh(buildId), `Panel refresh of #${buildId}`);

  return {
    ACTIVITY,
    settle,

    // Validates a registration without saving it; /register shows the
    // Terms of Service dialog in between. Returns what the dialog needs.
    async checkRegistration({ bundle, guildId, user, minecraftName }) {
      const termsVersion = await currentTermsVersion();
      const existing = await store.findParticipant(bundle.event.id, user.id);
      if (existing) {
        // Registered, but the terms changed since: only a re-acceptance is needed
        if (existing.termsVersion !== termsVersion) return { mode: "reaccept", participant: existing, team: bundle.team(existing.teamId), termsVersion };
        throw new UserError("register.already", { name: existing.minecraftName });
      }
      if (!canRegister(bundle.event, now())) throw new UserError("phase.registerClosed");
      const name = String(minecraftName || "").trim();
      if (!isMinecraftName(name)) throw new UserError("register.invalidName");

      // The server you register on decides your team: registering on the
      // Polish team's server makes you a member of Team Poland
      const team = bundle.team(bundle.guildLink(guildId)?.teamId);
      if (!team) throw new UserError("register.teamServerOnly");
      if (await store.findParticipantByMinecraft(bundle.event.id, name)) throw new UserError("register.nameTaken");
      return { mode: "new", name, team, termsVersion };
    },

    // Called when the user pressed "Accept & register"
    async register({ bundle, guildId, user, minecraftName, acceptedTermsVersion }) {
      const check = await this.checkRegistration({ bundle, guildId, user, minecraftName });
      // The terms may have changed while the dialog was open
      if (acceptedTermsVersion !== check.termsVersion) throw new UserError("legal.reaccept");
      if (check.mode === "reaccept") {
        const participant = await store.updateParticipant(check.participant.id, { termsVersion: check.termsVersion, termsAcceptedAt: now() });
        await store.logActivity({ eventId: bundle.event.id, type: ACTIVITY.TERMS_ACCEPTED, userId: user.id, actor: participant.minecraftName, details: `Terms ${check.termsVersion}` });
        return { participant, team: check.team, updated: true };
      }

      let participant;
      try {
        participant = await store.createParticipant({
          eventId: bundle.event.id,
          userId: user.id,
          minecraftName: check.name,
          teamId: check.team.id,
          termsVersion: check.termsVersion,
          termsAcceptedAt: now(),
        });
      } catch (err) {
        if (err.code === "P2002") throw new UserError("register.nameTaken");
        throw err;
      }
      await store.logActivity({
        eventId: bundle.event.id,
        type: ACTIVITY.REGISTERED,
        userId: user.id,
        actor: check.name,
        details: `Team ${check.team.name} · Terms ${check.termsVersion}`,
      });
      stats?.invalidate(bundle.event.id);
      log?.info(`${user.name} (${user.id}) registered as ${check.name} for team ${check.team.name}`);
      return { participant, team: check.team, updated: false };
    },

    // attachments: uploaded screenshots; mediaLinks: YouTube / imgur links
    async submit({ bundle, guildId, user, location, referenceType, referenceLink, area = null, attachments = [], mediaLinks = [] }) {
      if (!canSubmit(bundle.event, now())) throw new UserError("phase.submitClosed");
      const participant = await store.findParticipant(bundle.event.id, user.id);
      if (!participant) throw new UserError("common.notRegistered");
      if (participant.banned) throw new UserError("common.banned");
      if (participant.termsVersion !== (await currentTermsVersion())) throw new UserError("legal.reaccept");
      const link = String(referenceLink || "").trim();
      if (!isUrl(link)) throw new UserError("submit.invalidLink");
      const parsedArea = parseArea(area);
      if (Number.isNaN(parsedArea)) throw new UserError("submit.invalidArea");
      const media = splitMedia(mediaLinks);
      if (!media) throw new UserError("submit.invalidMedia");
      // Direct imgur images are stored like uploaded screenshots
      const toStore = [...attachments, ...media.imageLinks.map((m) => ({ url: m.url, name: m.name }))];
      // Judges need a top-down screenshot; videos and albums are only extras
      if (toStore.length === 0) throw new UserError("submit.imageRequired");

      const stored = await images.storeAll(`${bundle.event.id}/${user.id}`, toStore);
      const build = await store.createBuild({
        eventId: bundle.event.id,
        participantId: participant.id,
        teamId: participant.teamId,
        builderId: user.id,
        guildId,
        location: String(location || "").trim().slice(0, 200) || "—",
        referenceType: REFERENCE_TYPES.includes(referenceType) ? referenceType : "other",
        referenceLink: link,
        area: parsedArea,
        images: stored.urls,
        media: media.mediaLinks.slice(0, MAX_MEDIA_LINKS),
      });
      await store.logActivity({
        eventId: bundle.event.id,
        type: ACTIVITY.BUILD_CREATED,
        buildId: build.id,
        userId: user.id,
        actor: participant.minecraftName,
        details: `Reference: ${referenceType}`,
      });
      stats?.invalidate(bundle.event.id);
      await background(panels?.publish({ ...build, participant }), `Publishing build #${build.id}`);
      log?.info(`Build #${build.id} submitted by ${participant.minecraftName}`);
      return { build, participant, allStored: stored.allStored || !stored.storageEnabled };
    },

    async vote({ bundle, buildId, user, values }) {
      if (!canJudge(bundle.event, now())) throw new UserError("phase.judgeClosed");
      const judge = bundle.judge(user.id);
      if (!judge) throw new UserError("common.notJudge");
      const invalid = validateVote(values, bundle.scoring);
      if (invalid) throw new UserError(invalid.key, invalid.vars);

      const build = await loadBuild(bundle, buildId);
      const eligibility = checkJudgeEligibility({ build, judge, votes: build.votes, teams: bundle.teams });
      if (!eligibility.ok) throw new UserError(`judge.${eligibility.reason}`, { slot: judge.teamId ? bundle.team(judge.teamId)?.name : "neutral" });

      try {
        await store.upsertVote({ buildId, judgeId: user.id, judgeName: user.name, slot: eligibility.slot, ...values });
      } catch (err) {
        if (err instanceof SlotTakenError) throw new UserError("judge.slotTaken", { slot: eligibility.slot });
        throw err;
      }

      const wasComplete = build.status === "COMPLETE";
      const result = await settle(bundle, buildId);
      const done = new Set(result.build.votes.map((v) => v.slot)).size;
      const required = requiredSlots(bundle.teams).length;
      const completedNow = result.evaluation.status === "COMPLETE" && !wasComplete;

      await store.logActivity({
        eventId: bundle.event.id,
        type: completedNow ? ACTIVITY.COMPLETED : ACTIVITY.VOTED,
        buildId,
        userId: build.builderId,
        actor: user.name,
        points: result.pointChange?.delta || null,
        details: `${eligibility.update ? "Updated vote" : "Vote"} (${eligibility.slot}): B ${values.basePoints} · E ${values.effort} · D ${values.detail}` +
          (result.evaluation.status === "COMPLETE" ? ` → total ${result.evaluation.total}` : ` (${done}/${required})`),
      });
      refreshPanels(buildId);
      return { ...result, update: eligibility.update, done, required, completedNow };
    },

    async reject({ bundle, buildId, user, reason }) {
      await requireJudgeOrAdmin(bundle, user.id);
      const build = await loadBuild(bundle, buildId);
      if (build.status === "REJECTED") throw new UserError("reject.already");
      if (String(build.builderId) === String(user.id)) throw new UserError("judge.ownBuild");
      await store.updateBuild(buildId, { status: "REJECTED", rejectReason: String(reason).slice(0, 1000), rejectedBy: BigInt(user.id) });
      const result = await settle(bundle, buildId);
      await store.logActivity({
        eventId: bundle.event.id,
        type: ACTIVITY.REJECTED,
        buildId,
        userId: build.builderId,
        actor: user.name,
        points: result.pointChange?.delta || null,
        details: `Reason: ${reason}`,
      });
      refreshPanels(buildId);
      return result;
    },

    // The builder fixed a rejected build: back into judging with fresh votes
    async resubmit({ bundle, buildId, user, location, referenceLink, note }) {
      const build = await loadBuild(bundle, buildId);
      if (String(build.builderId) !== String(user.id)) throw new UserError("common.notOwner");
      if (build.status !== "REJECTED") throw new UserError("resubmit.notRejected");
      if (referenceLink && !isUrl(referenceLink)) throw new UserError("submit.invalidLink");
      const notes = [build.extraInfo, note ? `↻ ${note}` : null].filter(Boolean).join("\n").slice(-1000);
      await store.clearVotes(buildId);
      await store.updateBuild(buildId, {
        status: "PENDING",
        rejectReason: null,
        rejectedBy: null,
        override: null,
        ...(location ? { location: location.slice(0, 200) } : {}),
        ...(referenceLink ? { referenceLink } : {}),
        extraInfo: notes || null,
      });
      const result = await settle(bundle, buildId);
      await store.logActivity({ eventId: bundle.event.id, type: ACTIVITY.RESUBMITTED, buildId, userId: user.id, actor: user.name, details: note || null });
      refreshPanels(buildId);
      return result;
    },

    async setInfo({ bundle, buildId, user, text }) {
      const build = await loadBuild(bundle, buildId);
      if (String(build.builderId) !== String(user.id)) throw new UserError("common.notOwner");
      await store.updateBuild(buildId, { extraInfo: String(text).trim().slice(0, 1000) });
      await store.logActivity({ eventId: bundle.event.id, type: ACTIVITY.INFO, buildId, userId: user.id, actor: user.name });
      refreshPanels(buildId);
    },

    // Overrides single categories of the final score, with a reason
    async correct({ bundle, buildId, user, reason, values }) {
      await requireJudgeOrAdmin(bundle, user.id);
      const changes = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== undefined));
      if (Object.keys(changes).length === 0) throw new UserError("correct.nothing");
      const build = await loadBuild(bundle, buildId);
      // Judges must not score their own builds, corrections included
      if (String(build.builderId) === String(user.id)) throw new UserError("judge.ownBuild");
      if (build.votes.length === 0) throw new UserError("correct.notJudged");
      const merged = { basePoints: build.basePoints, effort: build.effort, detail: build.detail, ...changes };
      const invalid = validateVote(merged, bundle.scoring);
      if (invalid) throw new UserError(invalid.key, invalid.vars);

      const oldTotal = build.total;
      await store.updateBuild(buildId, {
        override: { ...(build.override || {}), ...changes, reason, by: String(user.id), byName: user.name, at: now().toISOString() },
      });
      const result = await settle(bundle, buildId);
      await store.logActivity({
        eventId: bundle.event.id,
        type: ACTIVITY.CORRECTED,
        buildId,
        userId: build.builderId,
        actor: user.name,
        points: result.pointChange?.delta || null,
        details: `${oldTotal} → ${result.evaluation.total} · Reason: ${reason}`,
      });
      refreshPanels(buildId);
      return { ...result, oldTotal: round2(oldTotal) };
    },

    async remove({ bundle, buildId, user, reason }) {
      await requireJudgeOrAdmin(bundle, user.id);
      const build = await loadBuild(bundle, buildId);
      await store.deleteBuild(buildId);
      const pointChange = await store.recalculateParticipant(build.participantId);
      stats?.invalidate(bundle.event.id);
      await store.logActivity({
        eventId: bundle.event.id,
        type: ACTIVITY.DELETED,
        buildId,
        userId: build.builderId,
        actor: user.name,
        points: pointChange?.delta || null,
        details: `Reason: ${reason}`,
      });
      await background(panels?.removeMessages(build), `Removing panels of #${buildId}`);
      await background(images?.removeAll(build.images), `Removing images of #${buildId}`);
      return { build, pointChange };
    },
  };
}

module.exports = { createActionService, ACTIVITY };
