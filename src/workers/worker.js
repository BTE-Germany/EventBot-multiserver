// Entry point of every pool worker: runs the named task and reports back
const { parentPort } = require("worker_threads");
const tasks = require("./tasks.js");

parentPort.on("message", async ({ id, task, payload }) => {
  try {
    const fn = tasks[task];
    if (!fn) throw new Error(`Unknown task "${task}"`);
    const { result, transfer = [] } = await fn(payload);
    parentPort.postMessage({ id, result }, transfer);
  } catch (err) {
    parentPort.postMessage({ id, error: { message: err.message, stack: err.stack } });
  }
});
