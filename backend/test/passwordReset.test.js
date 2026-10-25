import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, afterEach, beforeEach, mock, test } from "node:test";

// Password reset by emailed link. Queries, the mail client, the breached
// password check and the socket server are stubbed; nothing leaves the machine.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";
process.env.CLIENT_URL = "https://convo.test";
// Set (even empty) so a developer's .env can't change the sender under test.
process.env.EMAIL_FROM = "";
process.env.EMAIL_FROM_NAME = "";

const { default: User } = await import("../src/models/user.model.js");
const { default: PasswordReset } = await import("../src/models/passwordReset.model.js");
const { default: EmailVerification } = await import("../src/models/emailVerification.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { resendClient } = await import("../src/config/resend.js");
const reset = await import("../src/services/passwordReset.service.js");
const { checkPasswordReset, forgotPassword, resetPassword } = await import("../src/controllers/auth.controller.js");
const { sessionRoom } = await import("../src/services/socket-session.service.js");
const { io } = await import("../src/config/socket.js");
const { jwttoken } = await import("../src/utils/jwt.js");
const { default: bcrypt } = await import("bcrypt");
const { ENV } = await import("../src/config/env.js");

logger.silent = true;
after(() => io.close());

const userId = "507f1f77bcf86cd799439011";
const account = { _id: userId, email: "ann@example.com", fullName: "Ann Smith" };
const goodPassword = "violet-anchor-harbor-71";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
// A query that resolves to `result` whether or not it is narrowed first.
const query = (result) => ({ select: () => query(result), lean: () => Promise.resolve(result) });
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
  cookie(name, value, options) { this.cookieValue = { name, value, options }; },
});
const afterResponse = () => new Promise((resolve) => setImmediate(resolve));

let sent;
beforeEach(() => {
  sent = [];
  mock.method(resendClient.emails, "send", async (payload) => {
    sent.push(payload);
    return { data: { id: "email" }, error: null };
  });
  mock.method(globalThis, "fetch", async () => new Response("", { status: 200 }));
});
afterEach(() => mock.restoreAll());

test("a reset link is stored only as a hash, expires in an hour and is emailed", async () => {
  mock.method(User, "findOne", () => query(account));
  mock.method(PasswordReset, "findOne", () => query(null));
  const upsert = mock.method(PasswordReset, "findOneAndUpdate", async () => ({}));
  const now = new Date("2026-10-25T10:00:00Z");

  assert.equal(await reset.requestPasswordReset("ann@example.com", now), true);

  const [filter, update, options] = upsert.mock.calls[0].arguments;
  assert.deepEqual(filter, { userId });
  assert.deepEqual(options, { upsert: true });
  assert.equal(update.$set.expiresAt.getTime() - now.getTime(), 60 * 60 * 1000);

  const [mail] = sent;
  assert.equal(mail.to, "ann@example.com");
  assert.match(mail.subject, /Reset your Convo password/);
  const token = mail.text.match(/reset-password\?token=([\w-]+)/)[1];
  assert.equal(update.$set.tokenHash, sha256(token));
  assert.ok(!JSON.stringify(update).includes(token), "the token itself is never stored");
  assert.ok(mail.html.includes(`https://convo.test/reset-password?token=${token}`));
  assert.match(mail.text, /expires in 1 hour/);
});

test("no email for an unknown address, and none twice within a minute", async () => {
  mock.method(User, "findOne", () => query(null));
  assert.equal(await reset.requestPasswordReset("nobody@example.com"), false);

  const now = new Date("2026-10-25T10:00:30Z");
  mock.method(User, "findOne", () => query(account));
  mock.method(PasswordReset, "findOne", () => query({ updatedAt: new Date("2026-10-25T10:00:00Z") }));
  const upsert = mock.method(PasswordReset, "findOneAndUpdate", async () => ({}));
  assert.equal(await reset.requestPasswordReset("ann@example.com", now), false);

  assert.equal(upsert.mock.callCount(), 0);
  assert.equal(sent.length, 0);
});

test("a link whose email failed is removed, so the next try isn't held up", async () => {
  mock.method(User, "findOne", () => query(account));
  mock.method(PasswordReset, "findOne", () => query(null));
  mock.method(PasswordReset, "findOneAndUpdate", async () => ({}));
  const remove = mock.method(PasswordReset, "deleteOne", async () => ({ deletedCount: 1 }));
  resendClient.emails.send.mock.mockImplementation(async () => ({ data: null, error: { message: "domain not verified" } }));

  await assert.rejects(() => reset.requestPasswordReset("ann@example.com"), /domain not verified/);
  assert.deepEqual(remove.mock.calls[0].arguments, [{ userId }]);
});

test("asking for a reset always gets the same answer", async () => {
  const answers = [];
  for (const outcome of [null, account, "fails"]) {
    mock.method(User, "findOne", () => {
      if (outcome === "fails") throw new Error("database down");
      return query(outcome);
    });
    mock.method(PasswordReset, "findOne", () => query(null));
    mock.method(PasswordReset, "findOneAndUpdate", async () => ({}));
    const res = response();
    await forgotPassword({ body: { email: "Ann@Example.com" }, requestId: "req" }, res);
    answers.push([res.statusCode, res.body.message]);
  }
  assert.equal(new Set(answers.map(String)).size, 1);
  assert.equal(answers[0][0], 200);
});

test("opening a link says whose password it resets without using it up", async () => {
  const now = new Date();
  const find = mock.method(PasswordReset, "findOne", () => query({ userId }));
  mock.method(User, "findById", () => query(account));
  const consume = mock.method(PasswordReset, "findOneAndDelete", () => query(null));

  const res = response();
  await checkPasswordReset({ body: { token: "t".repeat(43) }, requestId: "req" }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual({ email: res.body.email, fullName: res.body.fullName }, { email: account.email, fullName: account.fullName });
  const filter = find.mock.calls[0].arguments[0];
  assert.equal(filter.tokenHash, sha256("t".repeat(43)));
  assert.ok(filter.expiresAt.$gt >= now);
  assert.equal(consume.mock.callCount(), 0);
});

test("an unknown, used or expired link is refused the same way", async () => {
  mock.method(PasswordReset, "findOne", () => query(null));
  for (const body of [{ token: "t".repeat(43) }, { token: "short" }, {}]) {
    const res = response();
    await checkPasswordReset({ body, requestId: "req" }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "RESET_INVALID");
  }
});

// Stubs a valid link for `account` and the writes that use it.
const stubValidLink = ({ previousSession = "old-session", consumed = false } = {}) => {
  mock.method(PasswordReset, "findOne", () => query({ userId }));
  mock.method(User, "findById", () => query(account));
  const consume = mock.method(PasswordReset, "findOneAndDelete", () => query(consumed ? null : { userId }));
  const update = mock.method(User, "findByIdAndUpdate", () =>
    query({ ...account, profilePic: "", activeSessionId: previousSession })
  );
  const dropConfirmation = mock.method(EmailVerification, "deleteOne", async () => ({ deletedCount: 0 }));
  const revoked = [];
  mock.method(io, "to", (room) => ({ emit: (event, data) => revoked.push({ room, event, data }) }));
  const closed = [];
  mock.method(io, "in", (room) => ({ disconnectSockets: () => closed.push(room) }));
  return { consume, update, dropConfirmation, revoked, closed };
};

test("a new password from the link signs in here and signs out every other session", async () => {
  const { consume, update, dropConfirmation, revoked, closed } = stubValidLink();
  const res = response();

  await resetPassword({ body: { token: "t".repeat(43), password: goodPassword }, requestId: "req" }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.user, { _id: userId, email: account.email, fullName: account.fullName, profilePic: "" });
  assert.equal(consume.mock.calls[0].arguments[0].tokenHash, sha256("t".repeat(43)));

  const [id, [{ $set }], options] = update.mock.calls[0].arguments;
  assert.equal(id, userId);
  assert.deepEqual(options, { returnDocument: "before", updatePipeline: true });
  // A pipeline would read the "$2b$..." hash as a field path without $literal.
  assert.ok(await bcrypt.compare(goodPassword, $set.password.$literal), "only the hash is stored");
  // An unconfirmed email counts as confirmed: the link was sent to it.
  assert.deepEqual($set.emailVerifiedAt.$ifNull[0], "$emailVerifiedAt");
  assert.deepEqual(dropConfirmation.mock.calls[0].arguments, [{ userId }]);

  const token = jwttoken.verify(res.cookieValue.value);
  assert.equal(token.id, userId);
  assert.equal(token.sid, $set.activeSessionId.$literal);
  assert.notEqual(token.sid, "old-session");

  assert.deepEqual(closed, [sessionRoom(userId, "old-session")]);
  assert.equal(revoked[0].room, sessionRoom(userId, "old-session"));
  assert.match(revoked[0].data.message, /password was changed/);

  await afterResponse();
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /password was changed/);
});

test("a refused password leaves the link usable for another try", async () => {
  const { consume, update } = stubValidLink();
  const res = response();

  // Contains the account's surname, which the policy forbids.
  await resetPassword({ body: { token: "t".repeat(43), password: "smith-violet-harbor-71" }, requestId: "req" }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "PASSWORD_PERSONAL");
  assert.equal(res.body.field, "password");
  assert.equal(consume.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
});

test("a too-short password is a field error, a bad link is a link error", async () => {
  const short = response();
  await resetPassword({ body: { token: "t".repeat(43), password: "short" }, requestId: "req" }, short);
  assert.equal(short.statusCode, 400);
  assert.equal(short.body.field, "password");
  assert.match(short.body.error, /at least 12 characters/);

  const badLink = response();
  await resetPassword({ body: { token: "x", password: goodPassword }, requestId: "req" }, badLink);
  assert.equal(badLink.body.code, "RESET_INVALID");
});

test("a link used up by another request in the meantime changes nothing", async () => {
  const { update } = stubValidLink({ consumed: true });
  const res = response();

  await resetPassword({ body: { token: "t".repeat(43), password: goodPassword }, requestId: "req" }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "RESET_INVALID");
  assert.equal(update.mock.callCount(), 0);
  assert.equal(res.cookieValue, undefined);
});

test("locally without Resend the link goes to the server log and still works", async (t) => {
  t.after(() => { ENV.NODE_ENV = "test"; });
  ENV.NODE_ENV = "development";
  mock.method(User, "findOne", () => query(account));
  mock.method(PasswordReset, "findOne", () => query(null));
  const upsert = mock.method(PasswordReset, "findOneAndUpdate", async () => ({}));
  const remove = mock.method(PasswordReset, "deleteOne", async () => ({ deletedCount: 1 }));
  const logged = mock.method(logger, "info", () => {});

  assert.equal(await reset.requestPasswordReset("ann@example.com"), true);

  assert.equal(sent.length, 0, "nothing goes to Resend");
  assert.equal(remove.mock.callCount(), 0, "the logged link is kept");
  const { text } = logged.mock.calls.find(({ arguments: [message] }) => /Email/.test(message)).arguments[1];
  const token = text.match(/reset-password\?token=([\w-]+)/)[1];
  assert.equal(upsert.mock.calls[0].arguments[1].$set.tokenHash, sha256(token));
});

test("if saving the new password fails, the link keeps working", async () => {
  const pending = { userId, tokenHash: sha256("t".repeat(43)), expiresAt: new Date(Date.now() + 60000) };
  mock.method(PasswordReset, "findOneAndDelete", () => query(pending));
  mock.method(User, "findByIdAndUpdate", () => ({
    select: () => ({ lean: () => Promise.reject(new Error("write failed")) }),
  }));
  const restore = mock.method(PasswordReset, "create", async () => ({}));

  await assert.rejects(() => reset.completePasswordReset("t".repeat(43), goodPassword, "next"), /write failed/);
  assert.deepEqual(restore.mock.calls[0].arguments, [pending]);
});
