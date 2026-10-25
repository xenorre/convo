import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";

// Changing the sign-in email. Queries, the mail client and the socket
// server are stubbed; nothing leaves the machine.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";
process.env.CLIENT_URL = "https://convo.test";
process.env.EMAIL_FROM = "";
process.env.EMAIL_FROM_NAME = "";

const { default: User } = await import("../src/models/user.model.js");
const { default: EmailChange } = await import("../src/models/emailChange.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { resendClient } = await import("../src/config/resend.js");
const { cancelPendingEmailChange, changeEmail, getEmail } = await import("../src/controllers/account.controller.js");
const { confirmEmailChangeLink } = await import("../src/controllers/auth.controller.js");
const { userRoom } = await import("../src/services/socket-session.service.js");
const { io } = await import("../src/config/socket.js");
const { default: bcrypt } = await import("bcrypt");

logger.silent = true;
after(() => io.close());

const annId = "507f1f77bcf86cd799439011";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
let passwordHash;
before(async () => {
  passwordHash = await bcrypt.hash("copper-lantern-meadow-58", 4);
});

const query = (result) => ({ select: () => query(result), lean: () => Promise.resolve(result) });
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
});
const afterResponse = () => new Promise((resolve) => setImmediate(resolve));
const ann = () => ({ _id: annId, email: "ann@example.com", fullName: "Ann Smith", password: passwordHash });

let sent;
let emitted;
beforeEach(() => {
  sent = [];
  mock.method(resendClient.emails, "send", async (payload) => {
    sent.push(payload);
    return { data: { id: "email" }, error: null };
  });
  emitted = [];
  mock.method(io, "to", (room) => ({ emit: (event, data) => emitted.push({ room, event, data }) }));
});
afterEach(() => mock.restoreAll());

const change = async (body) => {
  const res = response();
  await changeEmail({ user: { _id: annId, email: "ann@example.com" }, body, requestId: "req" }, res);
  return res;
};

test("a change sends a link to the new address and a notice to the current one", async () => {
  mock.method(User, "findById", () => query(ann()));
  mock.method(User, "exists", async () => null);
  mock.method(EmailChange, "findOne", () => query(null));
  const upsert = mock.method(EmailChange, "findOneAndUpdate", async () => ({}));

  const res = await change({ newEmail: " Ann.New@Example.com ", password: "copper-lantern-meadow-58" });
  await afterResponse();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.pending.email, "ann.new@example.com");
  const [filter, update] = upsert.mock.calls[0].arguments;
  assert.deepEqual(filter, { userId: annId });
  assert.equal(update.$set.newEmail, "ann.new@example.com");
  assert.equal(update.$set.expiresAt - Date.now() > 23 * 60 * 60 * 1000, true, "the link works for a day");

  const [confirm, notice] = sent;
  assert.equal(confirm.to, "ann.new@example.com");
  const token = confirm.text.match(/confirm-email-change\?token=([\w-]+)/)[1];
  assert.equal(update.$set.tokenHash, sha256(token));
  assert.ok(!JSON.stringify(update).includes(token), "the token itself is never stored");
  assert.equal(notice.to, "ann@example.com");
  assert.match(notice.text, /ann\.new@example\.com/);
  assert.ok(!/href=/.test(notice.html), "the notice has nothing to click");
});

test("refusals say what to fix, on the right field", async () => {
  const cases = [
    [{ newEmail: "ann.new@example.com", password: "guess" }, 400, "EMAIL_CHANGE_INVALID_PASSWORD", "password"],
    [{ newEmail: "ann@example.com", password: "copper-lantern-meadow-58" }, 400, "EMAIL_CHANGE_SAME_EMAIL", "newEmail"],
    [{ newEmail: "bob@example.com", password: "copper-lantern-meadow-58" }, 409, "EMAIL_CHANGE_EMAIL_TAKEN", "newEmail"],
  ];
  for (const [body, status, code, field] of cases) {
    mock.method(User, "findById", () => query(ann()));
    mock.method(User, "exists", async ({ email }) => (email === "bob@example.com" ? { _id: "bob" } : null));
    const upsert = mock.method(EmailChange, "findOneAndUpdate", async () => ({}));

    const res = await change(body);

    assert.deepEqual([res.statusCode, res.body.code, res.body.field], [status, code, field]);
    assert.equal(upsert.mock.callCount(), 0);
    mock.restoreAll();
  }
  assert.equal(sent.length, 0);
});

test("an invalid address is a field error before anything is checked", async () => {
  const lookup = mock.method(User, "findById", () => query(ann()));
  const res = await change({ newEmail: "not-an-email", password: "x" });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.field, "newEmail");
  assert.equal(lookup.mock.callCount(), 0);
});

test("settings show the current email and a change waiting for its link", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  mock.method(EmailChange, "findOne", () => query({ newEmail: "ann.new@example.com", expiresAt }));
  const res = response();
  await getEmail({ user: { _id: annId, email: "ann@example.com" }, requestId: "req" }, res);
  assert.deepEqual(
    { email: res.body.email, pending: res.body.pending },
    { email: "ann@example.com", pending: { email: "ann.new@example.com", expiresAt } }
  );

  const remove = mock.method(EmailChange, "deleteOne", async () => ({ deletedCount: 1 }));
  const cancelled = response();
  await cancelPendingEmailChange({ user: { _id: annId }, requestId: "req" }, cancelled);
  assert.deepEqual(remove.mock.calls[0].arguments, [{ userId: annId }]);
  assert.equal(cancelled.body.pending, null);
});

const confirm = async (token) => {
  const res = response();
  await confirmEmailChangeLink({ body: { token }, requestId: "req" }, res);
  return res;
};

test("the link moves the account to the new address, tells open tabs and the old address", async () => {
  const consume = mock.method(EmailChange, "findOneAndDelete", () =>
    query({ userId: annId, newEmail: "ann.new@example.com" })
  );
  const update = mock.method(User, "findOneAndUpdate", () => query({ email: "ann@example.com", fullName: "Ann Smith" }));

  const res = await confirm("t".repeat(43));
  await afterResponse();

  assert.equal(res.statusCode, 200);
  assert.deepEqual({ email: res.body.email, userId: res.body.userId }, { email: "ann.new@example.com", userId: annId });
  assert.equal(consume.mock.calls[0].arguments[0].tokenHash, sha256("t".repeat(43)));
  const [filter, change] = update.mock.calls[0].arguments;
  assert.deepEqual(filter, { _id: annId, deletedAt: null });
  assert.equal(change.$set.email, "ann.new@example.com");
  assert.ok(change.$set.emailVerifiedAt instanceof Date);

  assert.deepEqual(emitted, [{ room: userRoom(annId), event: "account:email-changed", data: { email: "ann.new@example.com" } }]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ann@example.com");
  assert.match(sent[0].subject, /email was changed/);
});

test("an unknown, used or expired link is refused the same way", async () => {
  mock.method(EmailChange, "findOneAndDelete", () => query(null));
  for (const token of ["t".repeat(43), "short"]) {
    const res = await confirm(token);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "EMAIL_CHANGE_INVALID");
  }
  assert.deepEqual(emitted, []);
});

test("an address taken in the meantime is refused and nothing changes", async () => {
  mock.method(EmailChange, "findOneAndDelete", () => query({ userId: annId, newEmail: "race@example.com" }));
  mock.method(User, "findOneAndUpdate", () => ({
    select: () => ({ lean: () => Promise.reject(Object.assign(new Error("E11000 duplicate key"), { code: 11000 })) }),
  }));

  const res = await confirm("t".repeat(43));

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "EMAIL_CHANGE_EMAIL_TAKEN");
  assert.deepEqual(emitted, []);
  assert.equal(sent.length, 0);
});
