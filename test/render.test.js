const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { battleCard, profileCard, esc } = require("../src/render/cards.js");
const { WorkerPool } = require("../src/core/workerPool.js");
const { createCardService } = require("../src/services/cards.js");
const { decorate } = require("../src/services/events.js");
const { translator } = require("../src/i18n/index.js");
const { buildLeaderboard } = require("../src/domain/leaderboard.js");
const { DEFAULT_SCORING } = require("../src/domain/scoring.js");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test("SVG output escapes user content", () => {
  assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  const svg = profileCard({ name: "<script>", teamName: "A&B", teamColor: "#123456", rankText: "#1", points: 3, pointsLabel: "P" });
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;script&gt;"));
  // Invalid colors never reach the SVG
  assert.ok(!battleCard({ title: "x", subtitle: "y", teams: [{ name: "t", color: "red;}", points: 1, builds: 1, area: 1, members: 1 }], labels: {} }).includes("red;}"));
});

test("cards rasterize to PNG on the worker pool", async () => {
  const pool = new WorkerPool({ size: 2 });
  try {
    const bundle = decorate({
      event: { id: 1, name: "Build Battle", status: "RUNNING", startsAt: "2026-12-04T15:00:00Z", endsAt: "2026-12-11T19:00:00Z", scoring: {} },
      teams: [
        { id: 1, name: "Germany", color: "#FFCC00" },
        { id: 2, name: "Poland", color: "#DC143C" },
      ],
      guilds: [],
      judges: [],
    });
    const lb = buildLeaderboard({
      participants: [{ id: 1, userId: "1", minecraftName: "Anna", teamId: 1 }],
      builds: [{ participantId: 1, status: "COMPLETE", total: 12, area: 100 }],
      teams: bundle.teams,
      scoring: DEFAULT_SCORING,
    });
    const cards = createCardService({ pool, fetchImpl: async () => ({ ok: false }) });
    for (const locale of ["de", "ja", "th", "hi"]) {
      const png = await cards.battle({ bundle, lb, t: translator(locale), subtitle: "Ends soon" });
      assert.ok(png.subarray(0, 4).equals(PNG), `battle card in ${locale}`);
      const meta = await sharp(png).metadata();
      assert.equal(meta.width, 1200);
    }
    const profile = await cards.profile({
      bundle,
      user: { avatarUrl: "https://example.invalid/a.png" },
      t: translator("pl"),
      data: { participant: { minecraftName: "Anna", teamId: 1 }, player: { rank: 1, of: 1, points: 12, builds: 1, isJudge: true }, averages: { basePoints: 2, effort: 4, detail: 6 } },
    });
    assert.ok(profile.subarray(0, 4).equals(PNG));
  } finally {
    await pool.close();
  }
});

test("convertImage turns screenshots into WebP", async () => {
  const pool = new WorkerPool({ size: 1 });
  try {
    const input = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: "#336699" } }).png().toBuffer();
    const data = new Uint8Array(input);
    const out = await pool.run("convertImage", { data }, [data.buffer]);
    const meta = await sharp(Buffer.from(out)).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 2560);
  } finally {
    await pool.close();
  }
});
