const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../src/domain/validation.js");
const w = require("../src/domain/eventWindow.js");

test("minecraft names, links and IDs", () => {
  assert.ok(v.isMinecraftName("Steve_123"));
  assert.ok(!v.isMinecraftName("ab"));
  assert.ok(!v.isMinecraftName("way_too_long_name_x"));
  assert.ok(!v.isMinecraftName("bad name"));
  assert.ok(v.isUrl("https://maps.google.com/?q=1"));
  assert.ok(!v.isUrl("maps.google.com"));
  assert.ok(!v.isUrl("javascript:alert(1)"));
  assert.ok(v.isSnowflake("804386907244462141"));
  assert.ok(!v.isSnowflake("123"));
});

test("parseArea", () => {
  assert.equal(v.parseArea(null), null);
  assert.equal(v.parseArea("120,5"), 120.5);
  assert.ok(Number.isNaN(v.parseArea(-3)));
  assert.ok(Number.isNaN(v.parseArea("abc")));
});

test("message submissions are parsed like the original bot", () => {
  const p = v.parseMessageSubmission("53.8655, 10.6866 3D https://earth.google.com/x 240 m²");
  assert.equal(p.link, "https://earth.google.com/x");
  assert.equal(p.referenceType, "3d");
  assert.equal(p.area, 240);
  assert.match(p.location, /^53\.8655, 10\.6866/);
  assert.equal(v.parseMessageSubmission("Streetview https://g.co/x").referenceType, "streetview");
  assert.equal(v.parseMessageSubmission("no link here").link, null);
});

test("image attachments", () => {
  assert.ok(v.isImageAttachment({ contentType: "image/png" }));
  assert.ok(!v.isImageAttachment({ contentType: "video/mp4" }));
  assert.ok(v.isImageAttachment({ name: "a.WEBP" }));
});

test("event phases follow the dates of the brief", () => {
  const event = { status: "RUNNING", startsAt: "2026-12-04T15:00:00Z", endsAt: "2026-12-11T19:00:00Z" };
  assert.equal(w.eventPhase(event, new Date("2026-12-01T00:00:00Z")), "upcoming");
  assert.equal(w.eventPhase(event, new Date("2026-12-05T00:00:00Z")), "running");
  assert.equal(w.eventPhase(event, new Date("2026-12-12T00:00:00Z")), "ended");
  assert.ok(w.canRegister(event, new Date("2026-12-01T00:00:00Z")));
  assert.ok(!w.canSubmit(event, new Date("2026-12-01T00:00:00Z")));
  assert.ok(w.canJudge(event, new Date("2026-12-12T00:00:00Z")));
  assert.ok(!w.canSubmit(event, new Date("2026-12-12T00:00:00Z")));
  assert.equal(w.eventPhase({ ...event, status: "DRAFT" }), "draft");
  assert.equal(w.eventPhase(null), "none");
  assert.equal(w.eventProgress(event, new Date("2026-12-04T15:00:00Z")), 0);
  assert.equal(w.eventProgress(event, new Date("2027-01-01T00:00:00Z")), 1);
  assert.equal(w.eventProgress({ status: "RUNNING" }), null);
});

test("YouTube and imgur links are recognized, other links are not media", () => {
  const yt = v.classifyMedia("https://youtu.be/dQw4w9WgXcQ?t=5");
  assert.equal(yt.kind, "youtube");
  assert.equal(yt.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(yt.thumbnail, "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.equal(v.classifyMedia("https://m.youtube.com/watch?v=dQw4w9WgXcQ").kind, "youtube");
  assert.equal(v.classifyMedia("https://www.youtube.com/shorts/dQw4w9WgXcQ").kind, "youtube");
  assert.equal(v.classifyMedia("https://i.imgur.com/AbC123x.JPG").kind, "imgur-image");
  assert.equal(v.classifyMedia("https://i.imgur.com/AbC123x.gifv").url, "https://imgur.com/AbC123x");
  assert.equal(v.classifyMedia("https://imgur.com/a/AbC123x/").url, "https://imgur.com/a/AbC123x");
  for (const bad of ["https://youtube.com/@channel", "https://youtube.com/watch?v=short", "https://evil.com/youtu.be/dQw4w9WgXcQ", "https://imgur.com/upload", "javascript:alert(1)", "nope"]) {
    assert.equal(v.classifyMedia(bad), null, bad);
  }
});

test("message submissions keep the reference separate from media links", () => {
  const p = v.parseMessageSubmission("53.86, 10.68 Street https://youtu.be/dQw4w9WgXcQ https://maps.google.com/x https://i.imgur.com/AbC123x.png");
  assert.equal(p.link, "https://maps.google.com/x");
  assert.deepEqual(p.media.map((m) => m.kind), ["youtube", "imgur-image"]);
  assert.equal(p.location, "53.86, 10.68 Street");
  assert.equal(v.splitMedia(["https://youtu.be/dQw4w9WgXcQ", "https://example.org"]), null);
  assert.deepEqual(v.splitMedia([]), { imageLinks: [], mediaLinks: [] });
});
