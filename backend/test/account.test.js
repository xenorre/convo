import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";

// Deleting an account and exporting its data. Queries, the mail client and
// the socket server are stubbed; nothing leaves the machine.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";
process.env.EMAIL_FROM = "";
process.env.EMAIL_FROM_NAME = "";

const { default: User } = await import("../src/models/user.model.js");
const { default: Message } = await import("../src/models/message.model.js");
const { default: Friendship } = await import("../src/models/friendship.model.js");
const { default: Block } = await import("../src/models/block.model.js");
const { default: ChatMute } = await import("../src/models/chatMute.model.js");
const { default: ChatHide } = await import("../src/models/chatHide.model.js");
const { default: ChatDeletion } = await import("../src/models/chatDeletion.model.js");
const { default: EmailVerification } = await import("../src/models/emailVerification.model.js");
const { default: PasswordReset } = await import("../src/models/passwordReset.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { resendClient } = await import("../src/config/resend.js");
const { deleteMyAccount, exportMyData } = await import("../src/controllers/account.controller.js");
const { userRoom } = await import("../src/services/socket-session.service.js");
const { protectRoute } = await import("../src/middleware/auth.middleware.js");
const { jwttoken } = await import("../src/utils/jwt.js");
const { io } = await import("../src/config/socket.js");
const { default: bcrypt } = await import("bcrypt");

logger.silent = true;
after(() => io.close());

const annId = "507f1f77bcf86cd799439011";
const bobId = "507f1f77bcf86cd799439012";
const cydId = "507f1f77bcf86cd799439013";
let passwordHash;
before(async () => {
  passwordHash = await bcrypt.hash("copper-lantern-meadow-58", 4);
});

// A query that resolves to `result` whether or not it is narrowed first.
const query = (result) => ({
  select: () => query(result),
  sort: () => query(result),
  lean: () => Promise.resolve(result),
});
const response = () => ({
  statusCode: 200,
  headers: {},
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
  set(name, value) { this.headers[name] = value; return this; },
  clearCookie(name) { this.cleared = name; },
});
const afterResponse = () => new Promise((resolve) => setImmediate(resolve));

let sent;
let emitted;
let disconnected;
beforeEach(() => {
  sent = [];
  mock.method(resendClient.emails, "send", async (payload) => {
    sent.push(payload);
    return { data: { id: "email" }, error: null };
  });
  emitted = [];
  disconnected = [];
  mock.method(io, "to", (room) => ({ emit: (event, data) => emitted.push({ room, event, data }) }));
  mock.method(io, "in", (room) => ({ disconnectSockets: () => disconnected.push(room) }));
});
afterEach(() => mock.restoreAll());

// Ann, who has written to Bob (one message was only a file) and is in a
// pending request with Cyd.
const stubAnn = ({ modifiedCount = 1 } = {}) => {
  mock.method(User, "findById", () =>
    query({ _id: annId, email: "ann@example.com", fullName: "Ann Smith", password: passwordHash, profilePic: "", activeSessionId: "s1" })
  );
  mock.method(Friendship, "find", () => query([{ requester: cydId, recipient: annId }]));
  mock.method(Message, "distinct", async (field) => (field === "receiverId" ? [bobId] : [bobId]));
  mock.method(Message, "find", () => query([]));
  const emptied = mock.method(User, "updateOne", async () => ({ modifiedCount }));
  const messageUpdates = mock.method(Message, "updateMany", async () => ({ modifiedCount: 0 }));
  const removed = [];
  for (const model of [Friendship, Block, ChatMute, ChatHide, ChatDeletion]) {
    mock.method(model, "deleteMany", async (filter) => { removed.push([model.modelName, filter]); return {}; });
  }
  for (const model of [EmailVerification, PasswordReset]) {
    mock.method(model, "deleteOne", async (filter) => { removed.push([model.modelName, filter]); return {}; });
  }
  return { emptied, messageUpdates, removed };
};

const remove = async (password) => {
  const res = response();
  await deleteMyAccount({ user: { _id: annId }, body: { password }, requestId: "req" }, res);
  return res;
};

test("a wrong password deletes nothing and keeps the session", async () => {
  const { emptied } = stubAnn();

  const res = await remove("guess");

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "ACCOUNT_INVALID_PASSWORD");
  assert.equal(emptied.mock.callCount(), 0);
  assert.equal(res.cleared, undefined);
  assert.deepEqual(emitted, []);
});

test("deleting empties the account, removes what was theirs and signs out everywhere", async () => {
  const { emptied, messageUpdates, removed } = stubAnn();

  const res = await remove("copper-lantern-meadow-58");

  assert.equal(res.statusCode, 200);
  assert.equal(res.cleared, "token");

  const [filter, update] = emptied.mock.calls[0].arguments;
  assert.deepEqual(filter, { _id: annId, deletedAt: null });
  assert.equal(update.$set.fullName, "Deleted account");
  assert.equal(update.$set.email, `deleted-${annId}@deleted.invalid`);
  assert.equal(update.$set.profilePic, "");
  assert.ok(update.$set.deletedAt instanceof Date);
  assert.ok(!(await bcrypt.compare("copper-lantern-meadow-58", update.$set.password)), "the old password is gone");
  assert.deepEqual(update.$unset, { activeSessionId: 1, privacy: 1 });

  // Their files go; a message that was only a file reads as deleted.
  assert.equal(messageUpdates.mock.callCount(), 2);
  assert.ok(messageUpdates.mock.calls[0].arguments[1].$set.deletedAt);
  assert.deepEqual(messageUpdates.mock.calls[1].arguments[1], { $unset: { image: 1 } });

  assert.deepEqual(removed.map(([name]) => name).sort(), [
    "Block", "ChatDeletion", "ChatHide", "ChatMute", "EmailVerification", "Friendship", "PasswordReset",
  ]);

  assert.deepEqual(disconnected, [userRoom(annId)]);
  assert.deepEqual(emitted.find((event) => event.event === "session:revoked").room, userRoom(annId));
  const told = emitted.filter((event) => event.event === "account:deleted").map((event) => event.room).sort();
  assert.deepEqual(told, [userRoom(bobId), userRoom(cydId)]);

  await afterResponse();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ann@example.com", "the goodbye goes to the address it had");
  assert.match(sent[0].subject, /account was deleted/);
});

test("an account deleted in the meantime counts as signed out", async () => {
  stubAnn({ modifiedCount: 0 });

  const res = await remove("copper-lantern-meadow-58");

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "ACCOUNT_DELETED");
});

test("the password is required", async () => {
  const res = await remove("");
  assert.equal(res.statusCode, 400);
});

test("the export lists the account, people by name and every message", async () => {
  mock.method(User, "findById", () =>
    query({ _id: annId, fullName: "Ann Smith", email: "ann@example.com", createdAt: "created", emailVerifiedAt: "confirmed", profilePic: "https://upload.wikimedia.org/placeholder.png" })
  );
  mock.method(Message, "find", () => query([
    { _id: "m1", senderId: annId, receiverId: bobId, text: "hi", createdAt: "t1", readAt: "r1" },
    { _id: "m2", senderId: bobId, receiverId: annId, image: "https://files/x.png", createdAt: "t2", hiddenFor: [annId] },
  ]));
  mock.method(Friendship, "find", () => query([
    { requester: annId, recipient: bobId, status: "accepted", respondedAt: "since" },
    { requester: cydId, recipient: annId, status: "pending", createdAt: "asked" },
  ]));
  for (const model of [Block, ChatMute, ChatHide, ChatDeletion]) mock.method(model, "find", () => query([]));
  mock.method(User, "find", () => query([
    { _id: bobId, fullName: "Bob Jones" },
    { _id: cydId, fullName: "Cyd Lee", deletedAt: "gone" },
  ]));

  const res = response();
  await exportMyData({ user: { _id: annId }, requestId: "req" }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  const data = res.body;
  assert.equal(data.format, "convo-account-export");
  assert.deepEqual(
    { email: data.account.email, profilePicture: data.account.profilePicture, privacy: data.account.privacy.allowMessagesFrom },
    { email: "ann@example.com", profilePicture: null, privacy: "friends" }
  );
  assert.deepEqual(data.friends, [{ user: { id: bobId, fullName: "Bob Jones" }, since: "since" }]);
  assert.deepEqual(data.friendRequests.received, [{ user: { id: cydId, fullName: "Deleted account" }, receivedAt: "asked" }]);
  assert.deepEqual(data.messages, [
    { id: "m1", direction: "sent", with: { id: bobId, fullName: "Bob Jones" }, sentAt: "t1", text: "hi", attachment: undefined, editedAt: undefined, readAt: "r1", deletedForEveryoneAt: undefined, deletedForMe: undefined },
    { id: "m2", direction: "received", with: { id: bobId, fullName: "Bob Jones" }, sentAt: "t2", text: undefined, attachment: "https://files/x.png", editedAt: undefined, readAt: undefined, deletedForEveryoneAt: undefined, deletedForMe: true },
  ]);
  assert.ok(!JSON.stringify(data).includes("password"));
});

test("a browser still holding a deleted or missing account's cookie is signed out, not shown an error", async () => {
  const token = jwttoken.sign({ id: annId, sid: "s1" });
  for (const user of [null, { _id: annId, deletedAt: new Date() }]) {
    mock.method(User, "findById", () => ({ select: () => Promise.resolve(user) }));
    const res = response();
    let passed = false;
    await protectRoute({ cookies: { token } }, res, () => { passed = true; });
    assert.equal(passed, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "ACCOUNT_DELETED");
    mock.restoreAll();
  }
});
