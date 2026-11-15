const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../src/web/auth.js");

const SECRET = "test-secret";

test("login tokens verify, expire and are bound to their type", () => {
  const now = Date.now();
  const token = auth.createLoginToken(SECRET, "804386907244462141", now);
  const payload = auth.verifyToken(SECRET, token, { type: "login", now });
  assert.equal(payload.uid, "804386907244462141");
  assert.equal(auth.verifyToken(SECRET, token, { type: "session", now }), null);
  assert.equal(auth.verifyToken(SECRET, token, { type: "login", now: now + auth.LOGIN_TTL_MS + 1 }), null);
  assert.equal(auth.verifyToken("other-secret", token, { type: "login", now }), null);
});

test("tampered tokens are rejected", () => {
  const token = auth.createSessionToken(SECRET, "1");
  const [data, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ typ: "session", uid: "2", exp: Date.now() + 1e9 })).toString("base64url");
  assert.equal(auth.verifyToken(SECRET, `${forged}.${sig}`, { type: "session" }), null);
  assert.equal(auth.verifyToken(SECRET, `${data}.x`, { type: "session" }), null);
  assert.equal(auth.verifyToken(SECRET, "garbage", { type: "session" }), null);
  assert.equal(auth.verifyToken(SECRET, undefined, { type: "session" }), null);
});

test("login links work only once", () => {
  const nonces = auth.createNonceRegistry();
  assert.equal(nonces.consume("a", Date.now() + 1000), true);
  assert.equal(nonces.consume("a", Date.now() + 1000), false);
  assert.equal(nonces.consume("b", Date.now() + 1000), true);
});

test("cookie parsing", () => {
  assert.deepEqual(auth.parseCookies("a=1; eventbot_session=x.y%3D; b"), { a: "1", eventbot_session: "x.y=" });
  assert.deepEqual(auth.parseCookies(undefined), {});
});
