import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";

// These tests stub every database operation and never use a developer's DB,
// Redis, credentials, or outbound email configuration.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";

const { default: User } = await import("../src/models/user.model.js");
const { default: PasswordReset } = await import("../src/models/passwordReset.model.js");
const { resendClient } = await import("../src/config/resend.js");
const { default: logger } = await import("../src/config/logger.js");
const { jwttoken } = await import("../src/utils/jwt.js");
const { changePassword } = await import("../src/controllers/auth.controller.js");
const { sessionRoom } = await import("../src/services/socket-session.service.js");
const { io } = await import("../src/config/socket.js");
const { default: bcrypt } = await import("bcrypt");

logger.silent = true;
// The breached-password check must never reach the real service from tests,
// and what follows a change (reset links, the notice email) stays stubbed.
let sent;
let cancelledResets;
beforeEach(() => {
  mock.method(globalThis, "fetch", async () => new Response("", { status: 200 }));
  sent = [];
  mock.method(resendClient.emails, "send", async (payload) => {
    sent.push(payload);
    return { data: { id: "email" }, error: null };
  });
  cancelledResets = mock.method(PasswordReset, "deleteOne", async () => ({ deletedCount: 1 }));
});
afterEach(() => mock.restoreAll());
after(() => io.close());

const userId = "507f1f77bcf86cd799439011";
const currentSid = "current-session";
let storedHash;
before(async () => {
  storedHash = await bcrypt.hash("old-password", 4);
});

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
  cookie(name, value, options) { this.cookieValue = { name, value, options }; },
});

// Stubs the user lookup, the conditional write and the socket server.
const stubAccount = ({ activeSessionId = currentSid, modifiedCount = 1 } = {}) => {
  mock.method(User, "findById", (id) => {
    assert.equal(id, userId);
    return {
      select(selection) {
        assert.equal(selection, "+activeSessionId");
        return Promise.resolve({ _id: userId, password: storedHash, activeSessionId });
      },
    };
  });
  const updateOne = mock.method(User, "updateOne", () => Promise.resolve({ modifiedCount }));
  const closedRooms = [];
  mock.method(io, "in", (room) => ({ disconnectSockets: () => closedRooms.push(room) }));
  const emitted = mock.method(io, "to", () => ({ emit: () => {} }));
  return { updateOne, closedRooms, emitted };
};

const change = async (body) => {
  const res = response();
  await changePassword({ user: { id: userId }, sessionId: currentSid, body, requestId: "req" }, res);
  return res;
};

test("a password change stores the new hash and moves this browser to a new session", async () => {
  const { updateOne, closedRooms, emitted } = stubAccount();

  const res = await change({ currentPassword: "old-password", newPassword: "violet-anchor-harbor-71" });

  assert.equal(res.statusCode, 200);
  const [filter, update] = updateOne.mock.calls[0].arguments;
  assert.deepEqual(filter, { _id: userId, activeSessionId: currentSid });
  assert.ok(await bcrypt.compare("violet-anchor-harbor-71", update.$set.password));
  assert.notEqual(update.$set.activeSessionId, currentSid);

  const token = jwttoken.verify(res.cookieValue.value);
  assert.equal(res.cookieValue.name, "token");
  assert.equal(token.id, userId);
  assert.equal(token.sid, update.$set.activeSessionId);

  // The old session's sockets close quietly instead of being told to sign out.
  assert.deepEqual(closedRooms, [sessionRoom(userId, currentSid)]);
  assert.equal(emitted.mock.callCount(), 0);
});

test("a wrong current password is a 400, so the client stays signed in", async () => {
  const { updateOne } = stubAccount();

  const res = await change({ currentPassword: "guess", newPassword: "violet-anchor-harbor-71" });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "INVALID_CURRENT_PASSWORD");
  assert.equal(updateOne.mock.callCount(), 0);
  assert.equal(res.cookieValue, undefined);
});

test("invalid requests are rejected before touching the account", async () => {
  const findById = mock.method(User, "findById", () => assert.fail("must not load the user"));

  for (const body of [
    { currentPassword: "old-password", newPassword: "short" },
    { currentPassword: "old-password", newPassword: "x".repeat(129) },
    { currentPassword: "old-password", newPassword: "old-password" },
    { currentPassword: "", newPassword: "violet-anchor-harbor-71" },
    { currentPassword: "old-password", newPassword: "violet-anchor-harbor-71", email: "a@b.c" },
  ]) {
    const res = await change(body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.equal(findById.mock.callCount(), 0);
});

test("a session replaced by another login cannot change the password", async () => {
  const { updateOne } = stubAccount({ activeSessionId: "newer-session" });

  const res = await change({ currentPassword: "old-password", newPassword: "violet-anchor-harbor-71" });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "SESSION_REVOKED");
  assert.equal(updateOne.mock.callCount(), 0);
});

test("a login that lands between the check and the write wins", async () => {
  const { closedRooms } = stubAccount({ modifiedCount: 0 });

  const res = await change({ currentPassword: "old-password", newPassword: "violet-anchor-harbor-71" });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "SESSION_REVOKED");
  assert.equal(res.cookieValue, undefined);
  assert.deepEqual(closedRooms, []);
});

test("a new password is held to the password policy before anything is changed", async () => {
  const { updateOne } = stubAccount();
  const res = response();
  await changePassword({
    user: { id: userId, fullName: "Dawid Zalewski", email: "dz@example.com" },
    sessionId: currentSid,
    body: { currentPassword: "old-password", newPassword: "zalewski-2026-rocks" },
    requestId: "req",
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "PASSWORD_PERSONAL");
  assert.equal(res.body.field, "newPassword");
  assert.equal(updateOne.mock.callCount(), 0);
});

test("a password change cancels pending reset links and tells the owner by email", async () => {
  stubAccount();
  const res = response();
  await changePassword({
    user: { id: userId, fullName: "Ann Smith", email: "ann@example.com" },
    sessionId: currentSid,
    body: { currentPassword: "old-password", newPassword: "violet-anchor-harbor-71" },
    requestId: "req",
  }, res);
  // The follow-up runs after the response.
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(cancelledResets.mock.calls[0].arguments, [{ userId }]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ann@example.com");
  assert.match(sent[0].subject, /password was changed/);
  assert.ok(!/href=/.test(sent[0].html), "the notice has nothing to click");
});
