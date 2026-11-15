const { threadId, isMainThread } = require("worker_threads");

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = () => LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

// Every line carries the thread it came from, which matters with sharded worker threads
function createLogger(scope) {
  const tag = isMainThread ? "main" : `thread-${threadId}`;
  const write = (level, args) => {
    if (LEVELS[level] < threshold()) return;
    const line = [new Date().toISOString(), level.toUpperCase().padEnd(5), `[${tag}]`, `[${scope}]`];
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(...line, ...args);
  };
  return {
    debug: (...a) => write("debug", a),
    info: (...a) => write("info", a),
    warn: (...a) => write("warn", a),
    error: (...a) => write("error", a),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}

module.exports = { createLogger };
