// When can people register, submit and judge?
function eventPhase(event, now = new Date()) {
  if (!event) return "none";
  if (event.status === "ARCHIVED") return "archived";
  if (event.status === "DRAFT") return "draft";
  if (event.status === "ENDED") return "ended";
  if (event.startsAt && now < new Date(event.startsAt)) return "upcoming";
  if (event.endsAt && now >= new Date(event.endsAt)) return "ended";
  return "running";
}

const canRegister = (event, now) => ["upcoming", "running"].includes(eventPhase(event, now));
const canSubmit = (event, now) => eventPhase(event, now) === "running";
// Judging continues after the building phase until the event is archived
const canJudge = (event, now) => ["running", "ended"].includes(eventPhase(event, now));

// 0..1 progress of the building phase, null without dates
function eventProgress(event, now = new Date()) {
  if (!event?.startsAt || !event?.endsAt) return null;
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  if (end <= start) return null;
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

module.exports = { eventPhase, canRegister, canSubmit, canJudge, eventProgress };
