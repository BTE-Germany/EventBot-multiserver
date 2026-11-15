// Dashboard login without OAuth: /dashboard in Discord hands an admin a signed,
// single-use link; opening it sets a signed session cookie. The signing secret
// is generated once and stored in the database (see config/settings.js).
const crypto = require("crypto");

const LOGIN_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const sign = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("base64url");

function createToken(secret, payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(secret, data)}`;
}

function verifyToken(secret, token, { type, now = Date.now() } = {}) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [data, signature] = token.split(".");
  const expected = sign(secret, data);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.typ !== type || typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

const createLoginToken = (secret, userId, now = Date.now()) =>
  createToken(secret, { typ: "login", uid: String(userId), exp: now + LOGIN_TTL_MS, n: crypto.randomBytes(9).toString("base64url") });

const createSessionToken = (secret, userId, now = Date.now()) =>
  createToken(secret, { typ: "session", uid: String(userId), exp: now + SESSION_TTL_MS });

// Remembers used login links until they expire, so each works only once
function createNonceRegistry() {
  const used = new Map();
  return {
    consume(nonce, exp, now = Date.now()) {
      for (const [n, e] of used) if (e < now) used.delete(n);
      if (used.has(nonce)) return false;
      used.set(nonce, exp);
      return true;
    },
  };
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((p) => p.trim().split("="))
      .filter(([k, v]) => k && v !== undefined)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))])
  );
}

module.exports = {
  LOGIN_TTL_MS,
  SESSION_TTL_MS,
  createToken,
  verifyToken,
  createLoginToken,
  createSessionToken,
  createNonceRegistry,
  parseCookies,
};
