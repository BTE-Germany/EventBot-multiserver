// A fixed-size pool of worker threads for CPU-heavy work (image conversion,
// rendering cards). Tasks are queued, run on the first idle worker, and a
// crashed worker is replaced without losing the other queued tasks.
const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");

const DEFAULT_SCRIPT = path.join(__dirname, "../workers/worker.js");

class WorkerPool {
  constructor({ size = defaultSize(), script = DEFAULT_SCRIPT, taskTimeoutMs = 60000 } = {}) {
    this.size = size;
    this.script = script;
    this.taskTimeoutMs = taskTimeoutMs;
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.nextId = 1;
    this.closed = false;
    this.stats = { completed: 0, failed: 0, restarts: 0 };
  }

  // Workers are started on first use, so importing the pool costs nothing
  ensureStarted() {
    while (this.workers.length < this.size) this.spawn();
  }

  spawn() {
    const worker = new Worker(this.script);
    worker.unref();
    worker.current = null;
    worker.on("message", (msg) => this.onMessage(worker, msg));
    worker.on("error", (err) => this.onCrash(worker, err));
    worker.on("exit", (code) => {
      if (code !== 0) this.onCrash(worker, new Error(`Worker exited with code ${code}`));
    });
    this.workers.push(worker);
    this.idle.push(worker);
  }

  run(task, payload, transferList = []) {
    if (this.closed) return Promise.reject(new Error("Worker pool is closed"));
    this.ensureStarted();
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, task, payload, transferList, resolve, reject });
      this.drain();
    });
  }

  drain() {
    while (this.idle.length && this.queue.length) {
      const worker = this.idle.shift();
      const job = this.queue.shift();
      worker.current = job;
      job.timer = setTimeout(() => {
        job.reject(new Error(`Task ${job.task} timed out after ${this.taskTimeoutMs}ms`));
        job.settled = true;
        worker.terminate();
      }, this.taskTimeoutMs);
      job.timer.unref?.();
      worker.ref();
      worker.postMessage({ id: job.id, task: job.task, payload: job.payload }, job.transferList);
    }
  }

  onMessage(worker, { id, result, error }) {
    const job = worker.current;
    if (!job || job.id !== id) return;
    clearTimeout(job.timer);
    worker.current = null;
    worker.unref();
    if (!job.settled) {
      if (error) {
        this.stats.failed++;
        job.reject(Object.assign(new Error(error.message), { stack: error.stack }));
      } else {
        this.stats.completed++;
        job.resolve(result);
      }
    }
    this.idle.push(worker);
    this.drain();
  }

  onCrash(worker, err) {
    if (worker.crashed) return;
    worker.crashed = true;
    const job = worker.current;
    if (job) {
      clearTimeout(job.timer);
      if (!job.settled) {
        this.stats.failed++;
        job.reject(err);
      }
    }
    this.workers = this.workers.filter((w) => w !== worker);
    this.idle = this.idle.filter((w) => w !== worker);
    if (!this.closed) {
      this.stats.restarts++;
      this.spawn();
      this.drain();
    }
  }

  info() {
    return {
      size: this.size,
      started: this.workers.length,
      busy: this.workers.length - this.idle.length,
      queued: this.queue.length,
      ...this.stats,
    };
  }

  async close() {
    this.closed = true;
    for (const job of this.queue) job.reject(new Error("Worker pool is closed"));
    this.queue = [];
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.idle = [];
  }
}

function defaultSize() {
  const cpus = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(4, cpus - 1));
}

module.exports = { WorkerPool, defaultSize };
