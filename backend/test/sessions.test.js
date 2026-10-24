import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

// These tests stub every database operation and never use a developer's DB,
// Redis, credentials, or outbound email configuration.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";

const { default: User } = await import("../src/models/user.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { jwttoken } = await import("../src/utils/jwt.js");
const { cookies } = await import("../src/utils/cookies.js");
const { protectRoute } = await import("../src/middleware/auth.middleware.js");
const { default: socketAuthMiddleware } = await import("../src/middleware/socket.auth.middleware.js");
const {
  activateSession,
  createSessionId,
  endSession,
  hasActiveSession,
  SESSION_REVOKED,
} = await import("../src/services/session.service.js");
const {
  createSocketRegistry,
  joinActiveSession,
  revokeSessionSockets,
  sessionRoom,
  userRoom,
} = await import("../src/services/socket-session.service.js");
const { login, logout, signUp } = await import("../src/controllers/auth.controller.js");
const { io } = await import("../src/config/socket.js");
const { default: bcrypt } = await import("bcrypt");

logger.silent = true;
afterEach(() => mock.restoreAll());
after(() => io.close());

const userId = "507f1f77bcf86cd799439011";
const makeUser = (sid = "current") => new User({
  _id: userId,
  email: "user@example.com",
  fullName: "Test User",
  password: "password-hash",
  activeSessionId: sid,
});

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
  cookie(name, value, options) { this.cookieValue = { name, value, options }; },
  clearCookie(name, options) { this.clearedCookie = { name, options }; },
});

const stubUser = (user = makeUser()) => {
  mock.method(User, "findById", (id) => {
    assert.equal(id, userId);
    return { select(selection) {
      assert.match(selection, /\+activeSessionId/);
      assert.match(selection, /-password/);
      return Promise.resolve(user);
    } };
  });
};

const protect = async (payload) => {
  const req = { cookies: { token: jwttoken.sign(payload) } };
  const res = response();
  let passed = false;
  await protectRoute(req, res, () => { passed = true; });
  return { req, res, passed };
};

const socket = () => ({
  connected: true,
  userId,
  sessionId: "current",
  rooms: [],
  events: [],
  join(room) { this.rooms.push(room); },
  emit(event, payload) { this.events.push({ event, payload }); },
  disconnect(close) { assert.equal(close, true); this.connected = false; },
});

test("session IDs are fresh and legacy or mismatched tokens are inactive", () => {
  assert.notEqual(createSessionId(), createSessionId());
  assert.equal(hasActiveSession(makeUser(), "current"), true);
  assert.equal(hasActiveSession(makeUser(), "old"), false);
  assert.equal(hasActiveSession(makeUser(), undefined), false);
  assert.equal(hasActiveSession(makeUser(undefined), undefined), false);
  assert.equal(User.schema.path("activeSessionId").options.select, false);
});

test("HTTP authentication accepts the current session without leaking its ID or password", async () => {
  stubUser();
  const { req, res, passed } = await protect({ id: userId, sid: "current" });
  assert.equal(passed, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.sessionId, "current");
  assert.equal(req.user.id, userId);
  assert.equal(req.user.activeSessionId, undefined);
  assert.equal(req.user.password, undefined);
  assert.doesNotMatch(JSON.stringify(req.user), /activeSessionId|password/);
});

for (const sid of ["old", undefined]) {
  test(`HTTP authentication rejects ${sid || "legacy"} sessions with SESSION_REVOKED`, async () => {
    stubUser();
    const { req, res, passed } = await protect({ id: userId, sid });
    assert.equal(passed, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: SESSION_REVOKED.message, code: "SESSION_REVOKED" });
    assert.equal(req.user, undefined);
    // Never clear the cookie on a late response from an older request.
    assert.equal(res.clearedCookie, undefined);
  });
}

test("HTTP authentication rejects a missing token without querying Mongo", async () => {
  mock.method(User, "findById", () => assert.fail("Unexpected DB query"));
  const res = response();
  await protectRoute({ cookies: {} }, res, () => assert.fail("Unauthorized request passed"));
  assert.equal(res.statusCode, 401);
});

test("atomic concurrent logins return only the actual preceding session IDs", async () => {
  let current = "initial";
  mock.method(User, "findByIdAndUpdate", (id, update, options) => {
    assert.equal(id, userId);
    assert.deepEqual(options, { new: false });
    const previous = current;
    current = update.$set.activeSessionId;
    return { select: () => Promise.resolve({ activeSessionId: previous }) };
  });
  const preceding = await Promise.all([
    activateSession(userId, "login-a"),
    activateSession(userId, "login-b"),
  ]);
  assert.deepEqual(preceding, ["initial", "login-a"]);
  assert.equal(current, "login-b");
});

test("logout compares the token session before removing it", async () => {
  let current = "newer-device";
  mock.method(User, "updateOne", async (filter, update) => {
    assert.equal(filter._id, userId);
    assert.deepEqual(update, { $unset: { activeSessionId: 1 } });
    if (filter.activeSessionId !== current) return { modifiedCount: 0 };
    current = undefined;
    return { modifiedCount: 1 };
  });
  assert.equal(await endSession(userId, "old-device"), false);
  assert.equal(current, "newer-device");
  assert.equal(await endSession(userId, undefined), false);
  assert.equal(current, "newer-device");
  assert.equal(await endSession(userId, "newer-device"), true);
  assert.equal(current, undefined);
});

test("socket handshake accepts only the current session and strips internal fields", async () => {
  stubUser();
  const client = { handshake: { headers: { cookie: `other=x;token=${jwttoken.sign({ id: userId, sid: "current" })}` } } };
  let error;
  await socketAuthMiddleware(client, (err) => { error = err; });
  assert.equal(error, undefined);
  assert.equal(client.userId, userId);
  assert.equal(client.sessionId, "current");
  assert.equal(client.user.activeSessionId, undefined);
  assert.equal(client.user.password, undefined);
});

for (const sid of ["old", undefined]) {
  test(`socket handshake rejects ${sid || "legacy"} sessions with structured error data`, async () => {
    stubUser();
    const client = { handshake: { headers: { cookie: `token=${jwttoken.sign({ id: userId, sid })}` } } };
    let error;
    await socketAuthMiddleware(client, (err) => { error = err; });
    assert.equal(error.message, SESSION_REVOKED.message);
    assert.deepEqual(error.data, SESSION_REVOKED);
    assert.equal(client.user, undefined);
  });
}

test("socket handshake distinguishes unavailable authentication from invalid tokens", async () => {
  const client = { handshake: { headers: { cookie: "token=invalid" } } };
  let error;
  await socketAuthMiddleware(client, (err) => { error = err; });
  assert.equal(error.data.code, "UNAUTHORIZED");
  mock.method(User, "findById", () => { throw new Error("Mongo unavailable"); });
  client.handshake.headers.cookie = `token=${jwttoken.sign({ id: userId, sid: "current" })}`;
  await socketAuthMiddleware(client, (err) => { error = err; });
  assert.equal(error.data, undefined);
});

test("a stale socket joins only its session room while the post-handshake DB check is pending", async () => {
  const client = socket();
  let completeCheck;
  let notifyCheck;
  const checkStarted = new Promise((resolve) => { notifyCheck = resolve; });
  const check = new Promise((resolve) => { completeCheck = resolve; });
  const joining = joinActiveSession(client, () => { notifyCheck(); return check; });
  await checkStarted;
  assert.deepEqual(client.rooms, [sessionRoom(userId, "current")]);
  completeCheck(false);
  assert.equal(await joining, false);
  assert.equal(client.connected, false);
  assert.equal(client.rooms.includes(userRoom(userId)), false);
  assert.deepEqual(client.events, [{ event: "session:revoked", payload: SESSION_REVOKED }]);
});

test("an active socket joins its user room only after the DB check", async () => {
  const client = socket();
  const joined = await joinActiveSession(client, async (id, sid) => {
    assert.equal(id, userId);
    assert.equal(sid, "current");
    assert.deepEqual(client.rooms, [sessionRoom(userId, "current")]);
    return true;
  });
  assert.equal(joined, true);
  assert.deepEqual(client.rooms, [sessionRoom(userId, "current"), userRoom(userId)]);
});

test("a socket disconnected during validation never joins its user room", async () => {
  const client = socket();
  assert.equal(await joinActiveSession(client, async () => {
    client.connected = false;
    return true;
  }), false);
  assert.equal(client.rooms.includes(userRoom(userId)), false);
});

test("session revocation targets the session adapter room and disconnects all its sockets", () => {
  const calls = [];
  const adapter = {
    to(room) { return { emit: (event, payload) => calls.push({ room, event, payload }) }; },
    in(room) { return { disconnectSockets: (close) => calls.push({ room, close }) }; },
  };
  revokeSessionSockets(adapter, userId, "previous");
  assert.deepEqual(calls, [
    { room: sessionRoom(userId, "previous"), event: "session:revoked", payload: SESSION_REVOKED },
    { room: sessionRoom(userId, "previous"), close: true },
  ]);
  revokeSessionSockets(adapter, userId, undefined);
  assert.equal(calls.length, 2);
});

test("presence stays online when one of several tabs disconnects", () => {
  const registry = createSocketRegistry();
  registry.add(userId, "tab-1");
  registry.add(userId, "tab-2");
  registry.remove(userId, "tab-1");
  assert.deepEqual(registry.onlineUsers(), [userId]);
  assert.equal(registry.receiver(userId), "tab-2");
  registry.remove(userId, "unknown-tab");
  assert.deepEqual(registry.onlineUsers(), [userId]);
  registry.remove(userId, "tab-2");
  assert.deepEqual(registry.onlineUsers(), []);
  assert.equal(registry.receiver(userId), undefined);
});

test("cookie removal preserves security options and omits expiry and maxAge", () => {
  const res = response();
  cookies.clear(res, "token", { maxAge: 123, expires: new Date(), path: "/", secure: true });
  assert.equal(res.clearedCookie.options.httpOnly, true);
  assert.equal(res.clearedCookie.options.secure, true);
  assert.equal(res.clearedCookie.options.path, "/");
  assert.equal(Object.hasOwn(res.clearedCookie.options, "maxAge"), false);
  assert.equal(Object.hasOwn(res.clearedCookie.options, "expires"), false);
});

test("login issues a JWT bound to the newly saved session and revokes only the previous room", async () => {
  const user = makeUser("previous");
  mock.method(User, "findOne", async () => user);
  mock.method(bcrypt, "compare", async () => true);
  let savedSession;
  mock.method(User, "findByIdAndUpdate", (id, update) => {
    assert.equal(id, userId);
    savedSession = update.$set.activeSessionId;
    return { select: () => Promise.resolve(user) };
  });
  let revokedRoom;
  mock.method(io, "to", (room) => ({ emit(event, reason) {
    assert.equal(event, "session:revoked");
    assert.deepEqual(reason, SESSION_REVOKED);
    revokedRoom = room;
  } }));
  mock.method(io, "in", (room) => ({ disconnectSockets(close) {
    assert.equal(room, revokedRoom);
    assert.equal(close, true);
  } }));
  const res = response();
  await login({ body: { email: user.email, password: "test-password" } }, res);
  assert.equal(res.statusCode, 200);
  const token = jwttoken.verify(res.cookieValue.value);
  assert.equal(token.id, userId);
  assert.equal(token.sid, savedSession);
  assert.equal(revokedRoom, sessionRoom(userId, "previous"));
  assert.equal(res.body.user.activeSessionId, undefined);
  assert.equal(res.body.user.password, undefined);
});

test("signup starts a session without returning its ID in the user payload", async () => {
  mock.method(User, "findOne", async () => null);
  mock.method(User.prototype, "save", async function () { return this; });
  let savedSession;
  mock.method(User, "findByIdAndUpdate", (id, update) => {
    savedSession = update.$set.activeSessionId;
    return { select: () => Promise.resolve({ activeSessionId: undefined }) };
  });
  const res = response();
  mock.method(globalThis, "fetch", async () => new Response("", { status: 200 }));
  await signUp({ body: { fullName: "New User", email: "new@example.com", password: "violet-anchor-harbor-71" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(jwttoken.verify(res.cookieValue.value).sid, savedSession);
  assert.equal(res.body.user.activeSessionId, undefined);
  assert.equal(res.body.user.password, undefined);
});

test("delayed logout from a replaced session cannot revoke the new session's sockets", async () => {
  mock.method(User, "updateOne", async (filter) => {
    assert.equal(filter.activeSessionId, "old-device");
    return { modifiedCount: 0 };
  });
  mock.method(io, "to", () => assert.fail("Stale logout broadcast a revocation"));
  const res = response();
  await logout({ cookies: { token: jwttoken.sign({ id: userId, sid: "old-device" }) } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.clearedCookie, undefined);
});

test("logout reports a database failure instead of claiming the server session was ended", async () => {
  mock.method(User, "updateOne", async () => { throw new Error("Mongo unavailable"); });
  const res = response();
  await logout({ cookies: { token: jwttoken.sign({ id: userId, sid: "current" }) } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.clearedCookie, undefined);
});
