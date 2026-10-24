import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, afterEach, beforeEach, mock, test } from "node:test";

// Email confirmation for new accounts. Queries and the mail client are
// stubbed; no real DB and no email leaves the machine.
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
const { default: EmailVerification } = await import("../src/models/emailVerification.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { resendClient } = await import("../src/config/resend.js");
const verification = await import("../src/services/emailVerification.service.js");
const { resendVerificationEmail, verifyEmail } = await import("../src/controllers/auth.controller.js");
const { io } = await import("../src/config/socket.js");
const { jwttoken } = await import("../src/utils/jwt.js");

logger.silent = true;
after(() => io.close());

const userId = "507f1f77bcf86cd799439011";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const lean = (result) => ({ select: () => ({ lean: () => Promise.resolve(result) }), lean: () => Promise.resolve(result) });
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
  cookie(name, value, options) { this.cookieValue = { name, value, options }; },
});

let sent;
beforeEach(() => {
  sent = [];
  mock.method(resendClient.emails, "send", async (payload) => {
    sent.push(payload);
    return { data: { id: "email" }, error: null };
  });
});
afterEach(() => mock.restoreAll());

test("a link is stored only as a hash, expires in 24 hours and replaces the previous one", async () => {
  const upsert = mock.method(EmailVerification, "findOneAndUpdate", async () => ({}));
  const now = new Date("2026-10-25T10:00:00Z");

  const token = await verification.createVerificationToken(userId, now);

  const [filter, update, options] = upsert.mock.calls[0].arguments;
  assert.deepEqual(filter, { userId });
  assert.deepEqual(options, { upsert: true });
  assert.equal(update.$set.tokenHash, sha256(token));
  assert.ok(!JSON.stringify(update).includes(token), "the token itself is never stored");
  assert.equal(update.$set.expiresAt.getTime() - now.getTime(), 24 * 60 * 60 * 1000);
  assert.ok(token.length >= 40, "256 random bits");
});

test("the email links to the app with the token, from Convo, with the name escaped", async () => {
  await verification.sendVerificationEmail({ email: "ann@example.com", fullName: "<b>Ann</b>" }, "tok_123");

  const [mail] = sent;
  assert.equal(mail.to, "ann@example.com");
  assert.equal(mail.from, "Convo <onboarding@resend.dev>");
  assert.match(mail.subject, /Confirm your email/);
  assert.ok(mail.html.includes("https://convo.test/verify-email?token=tok_123"));
  assert.ok(mail.html.includes("&lt;b&gt;Ann&lt;/b&gt;"));
  assert.ok(!mail.html.includes("<b>Ann</b>"));
  assert.ok(mail.text.includes("https://convo.test/verify-email?token=tok_123"), "plain-text part too");
  assert.match(mail.text, /expires in 24 hours/);
});

test("without an API key nothing is sent, and that counts as a failure", async () => {
  resendClient.emails.send.mock.mockImplementation(async () => ({ data: { disabled: true }, error: null }));
  await assert.rejects(
    () => verification.sendVerificationEmail({ email: "a@b.co", fullName: "A" }, "t"),
    /RESEND_API_KEY is not set/
  );
});

test("a failed send is reported", async () => {
  resendClient.emails.send.mock.mockImplementation(async () => ({ data: null, error: { message: "domain not verified" } }));
  await assert.rejects(() => verification.sendVerificationEmail({ email: "a@b.co", fullName: "A" }, "t"), /domain not verified/);
});

test("confirming uses the link up and marks the account confirmed", async () => {
  const now = new Date("2026-10-25T10:00:00Z");
  const consume = mock.method(EmailVerification, "findOneAndDelete", () => lean({ userId }));
  const mark = mock.method(User, "findByIdAndUpdate", async () => ({ _id: userId }));

  const user = await verification.confirmEmail("tok_123", now);

  assert.deepEqual(consume.mock.calls[0].arguments[0], { tokenHash: sha256("tok_123"), expiresAt: { $gt: now } });
  assert.deepEqual(mark.mock.calls[0].arguments.slice(0, 2), [userId, { $set: { emailVerifiedAt: now } }]);
  assert.deepEqual(user, { _id: userId });

  consume.mock.mockImplementation(() => lean(null));
  assert.equal(await verification.confirmEmail("used-or-expired", now), null);
});

test("opening the link signs the user in", async () => {
  mock.method(EmailVerification, "findOneAndDelete", () => lean({ userId }));
  mock.method(User, "findByIdAndUpdate", (id, update) => {
    if (update.$set.emailVerifiedAt) {
      return Promise.resolve({ _id: userId, email: "ann@example.com", fullName: "Ann", profilePic: "p.png" });
    }
    return { select: () => Promise.resolve({ activeSessionId: undefined }) };
  });

  const res = response();
  await verifyEmail({ body: { token: "a".repeat(43) }, requestId: "req" }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.user, { id: userId, _id: userId, email: "ann@example.com", fullName: "Ann", profilePic: "p.png" });
  assert.equal(jwttoken.verify(res.cookieValue.value).id, userId);
});

test("a used, expired or malformed link signs nobody in", async () => {
  mock.method(EmailVerification, "findOneAndDelete", () => lean(null));
  for (const body of [{ token: "a".repeat(43) }, { token: "short" }, {}, { token: "a".repeat(43), extra: 1 }]) {
    const res = response();
    await verifyEmail({ body, requestId: "req" }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "VERIFICATION_INVALID");
    assert.equal(res.cookieValue, undefined);
  }
});

const resend = async (email) => {
  const res = response();
  await resendVerificationEmail({ body: { email }, requestId: "req" }, res);
  return res;
};

test("asking for a new link always gets the same answer", async () => {
  const replace = mock.method(EmailVerification, "findOneAndUpdate", async () => ({}));
  const findUser = mock.method(User, "findOne", () => lean(null));
  const pending = mock.method(EmailVerification, "findOne", () => lean(null));

  const unknown = await resend("nobody@example.com");
  findUser.mock.mockImplementation(() => lean({ _id: userId, email: "ann@example.com", fullName: "Ann", emailVerifiedAt: new Date() }));
  const confirmed = await resend("ann@example.com");
  findUser.mock.mockImplementation(() => lean({ _id: userId, email: "ann@example.com", fullName: "Ann", emailVerifiedAt: null }));
  pending.mock.mockImplementation(() => lean({ updatedAt: new Date(Date.now() - 10 * 1000) }));
  const tooSoon = await resend("ann@example.com");
  assert.equal(sent.length, 0);
  assert.equal(replace.mock.callCount(), 0);

  pending.mock.mockImplementation(() => lean({ updatedAt: new Date(Date.now() - 2 * 60 * 1000) }));
  const sentNow = await resend("ann@example.com");
  assert.equal(sent.length, 1);
  assert.equal(replace.mock.callCount(), 1);

  for (const res of [unknown, confirmed, tooSoon, sentNow]) {
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.message, unknown.body.message);
  }
});

test("existing accounts are marked confirmed, new unconfirmed ones are left alone", async () => {
  const update = mock.method(User, "updateMany", async () => ({ modifiedCount: 3 }));

  await verification.markExistingAccountsVerified();

  const [filter, pipeline] = update.mock.calls[0].arguments;
  assert.deepEqual(filter, { emailVerifiedAt: { $exists: false } });
  assert.deepEqual(pipeline, [{ $set: { emailVerifiedAt: { $ifNull: ["$createdAt", "$$NOW"] } } }]);
});

test("a link whose email failed is removed, so the next try isn't held up", async () => {
  mock.method(EmailVerification, "findOneAndUpdate", async () => ({}));
  const remove = mock.method(EmailVerification, "deleteOne", async () => ({ deletedCount: 1 }));
  resendClient.emails.send.mock.mockImplementation(async () => ({ data: null, error: { message: "The convo.com domain is not verified" } }));

  await assert.rejects(
    () => verification.issueVerification({ _id: userId, email: "ann@example.com", fullName: "Ann" }),
    /domain is not verified/
  );
  assert.deepEqual(remove.mock.calls[0].arguments[0], { userId });

  // Once sending works, the link stays.
  remove.mock.resetCalls();
  resendClient.emails.send.mock.mockImplementation(async () => ({ data: { id: "email" }, error: null }));
  await verification.issueVerification({ _id: userId, email: "ann@example.com", fullName: "Ann" });
  assert.equal(remove.mock.callCount(), 0);
});

test("after a failed send, asking again sends right away instead of waiting out the cooldown", async () => {
  // The failed attempt left nothing behind, so no recent link is found.
  mock.method(User, "findOne", () => lean({ _id: userId, email: "ann@example.com", fullName: "Ann", emailVerifiedAt: null }));
  mock.method(EmailVerification, "findOne", () => lean(null));
  mock.method(EmailVerification, "findOneAndUpdate", async () => ({}));

  assert.equal(await verification.resendVerification("ann@example.com"), true);
  assert.equal(sent.length, 1);
});
