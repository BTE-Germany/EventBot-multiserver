// Cross-thread notifications. BroadcastChannel reaches every worker thread of
// the process, so the dashboard (main thread) can tell the shards to drop caches.
const { BroadcastChannel } = require("worker_threads");

const CHANNEL = "eventbot-bus";

function createBus(name = CHANNEL) {
  const channel = new BroadcastChannel(name);
  channel.unref();
  const handlers = new Set();
  channel.onmessage = (msg) => {
    for (const h of handlers) {
      try {
        h(msg.data);
      } catch {
        // a broken subscriber must not affect the others
      }
    }
  };
  return {
    publish(topic, payload = {}) {
      const message = { topic, payload };
      channel.postMessage(message);
      // BroadcastChannel does not deliver to the sender itself
      for (const h of handlers) h(message);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      channel.close();
    },
  };
}

let shared;
const getBus = () => (shared ??= createBus());

module.exports = { createBus, getBus, TOPICS: { CONFIG: "config", EVENT: "event" } };
