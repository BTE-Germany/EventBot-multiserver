const test = require("node:test");
const assert = require("node:assert/strict");
const { WorkerPool } = require("../src/core/workerPool.js");

test("runs tasks on several threads in parallel", async () => {
  const pool = new WorkerPool({ size: 4 });
  try {
    const started = Date.now();
    const results = await Promise.all([1, 2, 3, 4].map(() => pool.run("sleep", { ms: 300 })));
    assert.deepEqual(results, [300, 300, 300, 300]);
    // Sequentially this would take 1200 ms
    assert.ok(Date.now() - started < 900, `took ${Date.now() - started} ms`);
    assert.equal(pool.info().started, 4);
  } finally {
    await pool.close();
  }
});

test("queues tasks when all workers are busy", async () => {
  const pool = new WorkerPool({ size: 1 });
  try {
    const results = await Promise.all([1, 2, 3].map((n) => pool.run("echo", { n })));
    assert.deepEqual(results.map((r) => r.n), [1, 2, 3]);
    assert.equal(pool.info().completed, 3);
  } finally {
    await pool.close();
  }
});

test("propagates task errors and keeps working", async () => {
  const pool = new WorkerPool({ size: 1 });
  try {
    await assert.rejects(pool.run("fail", { message: "boom" }), /boom/);
    await assert.rejects(pool.run("nope", {}), /Unknown task/);
    assert.deepEqual(await pool.run("echo", { ok: true }), { ok: true });
  } finally {
    await pool.close();
  }
});

test("replaces crashed workers without losing queued tasks", async () => {
  const pool = new WorkerPool({ size: 1 });
  try {
    const crash = pool.run("crash", {});
    const next = pool.run("echo", { after: "crash" });
    await assert.rejects(crash);
    assert.deepEqual(await next, { after: "crash" });
    assert.equal(pool.info().restarts, 1);
  } finally {
    await pool.close();
  }
});

test("times out hanging tasks", async () => {
  const pool = new WorkerPool({ size: 1, taskTimeoutMs: 100 });
  try {
    await assert.rejects(pool.run("sleep", { ms: 2000 }), /timed out/);
    assert.deepEqual(await pool.run("echo", 1), 1);
  } finally {
    await pool.close();
  }
});

test("rejects work after close", async () => {
  const pool = new WorkerPool({ size: 1 });
  await pool.close();
  await assert.rejects(pool.run("echo", {}), /closed/);
});
