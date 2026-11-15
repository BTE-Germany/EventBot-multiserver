// Small TTL cache with async loaders; concurrent loads of one key share a promise
function createCache({ ttlMs = 15000, now = Date.now } = {}) {
  const entries = new Map();
  return {
    async get(key, loader) {
      const hit = entries.get(key);
      if (hit && hit.expires > now()) return hit.value;
      const value = Promise.resolve().then(loader);
      entries.set(key, { value, expires: now() + ttlMs });
      value.catch(() => entries.delete(key));
      return value;
    },
    delete: (key) => entries.delete(key),
    clear: () => entries.clear(),
  };
}

module.exports = { createCache };
