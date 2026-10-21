import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

// These tests stub every database and storage call and never use a
// developer's DB, Redis, credentials, storage bucket or email configuration.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";

const { default: User } = await import("../src/models/user.model.js");
const { default: Block } = await import("../src/models/block.model.js");
const { default: Friendship, friendPairKey } = await import("../src/models/friendship.model.js");
const { default: Message } = await import("../src/models/message.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { s3Storage } = await import("../src/config/storage.js");
const privacy = await import("../src/controllers/privacy.controller.js");
const { sendMessage } = await import("../src/controllers/message.controller.js");
const { messagePermission, PRIVACY_DEFAULTS, visibleOnlineUsers } = await import("../src/services/privacy.service.js");
const { io } = await import("../src/config/socket.js");

logger.silent = true;
afterEach(() => mock.restoreAll());
after(() => io.close());

const ada = { _id: "507f1f77bcf86cd799439011", fullName: "Ada", profilePic: "" };
const bob = { _id: "507f1f77bcf86cd799439012" };

const query = (value) => {
  const chain = {
    select: () => chain,
    populate: () => chain,
    sort: () => chain,
    lean: () => Promise.resolve(value),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return chain;
};

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
});

const call = async (handler, { body = {}, params = {}, file } = {}) => {
  const res = response();
  await handler({ body, params, file, user: { ...ada, id: ada._id }, requestId: "req" }, res);
  return res;
};

const captureSocket = () => {
  const events = [];
  mock.method(io, "to", (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }));
  mock.method(io, "emit", (event, payload) => events.push({ room: "*", event, payload }));
  return events;
};

test("settings saved before privacy existed read as the defaults", async () => {
  mock.method(User, "findById", () => query({ _id: ada._id }));

  const res = await call(privacy.getSettings);

  assert.deepEqual(res.body.privacy, PRIVACY_DEFAULTS);
  assert.equal(PRIVACY_DEFAULTS.allowMessagesFrom, "friends");
});

test("privacy updates are validated and only touch the given fields", async () => {
  const update = mock.method(User, "findByIdAndUpdate", (id, changes) =>
    query({ privacy: { allowMessagesFrom: changes.$set["privacy.allowMessagesFrom"] } }));
  const events = captureSocket();

  for (const body of [{}, { privacy: {} }, { privacy: { allowMessagesFrom: "strangers" } }, { privacy: { showOnlineStatus: "no" } }, { privacy: { allowMessagesFrom: "everyone" }, email: "x" }]) {
    assert.equal((await call(privacy.updateSettings, { body })).statusCode, 400, JSON.stringify(body));
  }
  assert.equal(update.mock.callCount(), 0);

  const res = await call(privacy.updateSettings, { body: { privacy: { allowMessagesFrom: "everyone" } } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(update.mock.calls[0].arguments[1], { $set: { "privacy.allowMessagesFrom": "everyone" } });
  assert.equal(res.body.privacy.allowMessagesFrom, "everyone");
  assert.equal(events.length, 0, "presence is only re-sent when the online setting changes");

  await call(privacy.updateSettings, { body: { privacy: { showOnlineStatus: false } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events.map(({ event }) => event), ["getOnlineUsers"]);
});

test("blocking ends the friendship and tells the other side only that", async () => {
  mock.method(User, "exists", async () => ({ _id: bob._id }));
  const upsert = mock.method(Block, "updateOne", async () => ({}));
  const remove = mock.method(Friendship, "findOneAndDelete", () => query({ _id: "f1", status: "accepted" }));
  const events = captureSocket();

  const res = await call(privacy.block, { params: { id: bob._id } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(upsert.mock.calls[0].arguments[0], { blocker: ada._id, blocked: bob._id });
  assert.deepEqual(remove.mock.calls[0].arguments[0], { pairKey: friendPairKey(ada._id, bob._id) });
  assert.deepEqual(events, [{ room: `user:${bob._id}`, event: "friend:removed", payload: { userId: ada._id } }]);

  mock.method(Friendship, "findOneAndDelete", () => query({ _id: "r1", status: "pending" }));
  const pending = await call(privacy.block, { params: { id: bob._id } });
  assert.equal(pending.body.endedFriendRequestId, "r1");
  assert.equal(events.at(-1).event, "friend:request:removed");
});

test("block errors map to clear status codes", async () => {
  captureSocket();
  assert.equal((await call(privacy.block, { params: { id: ada._id } })).statusCode, 400);

  mock.method(User, "exists", async () => null);
  assert.equal((await call(privacy.block, { params: { id: bob._id } })).statusCode, 404);

  mock.method(Block, "deleteOne", async () => ({ deletedCount: 0 }));
  assert.equal((await call(privacy.unblock, { params: { id: bob._id } })).statusCode, 404);
});

test("message permission: blocks, then the receiver's setting, then current friends", async () => {
  const state = { blocked: false, friends: false };
  mock.method(Block, "exists", async () => (state.blocked ? {} : null));
  mock.method(Friendship, "exists", async () => (state.friends ? {} : null));
  const history = mock.method(Message, "exists", async () => ({}));
  const check = (receiverPrivacy) => messagePermission(ada._id, { _id: bob._id, privacy: receiverPrivacy });

  assert.deepEqual(await check(undefined), { allowed: false, reason: "FRIENDS_ONLY" });
  assert.equal(history.mock.callCount(), 0, "a shared history does not count as permission");
  assert.deepEqual(await check({ allowMessagesFrom: "everyone" }), { allowed: true });
  state.friends = true;
  assert.deepEqual(await check(undefined), { allowed: true });
  state.blocked = true;
  assert.deepEqual(await check({ allowMessagesFrom: "everyone" }), { allowed: false, reason: "BLOCKED" });
});

test("refused messages are rejected before any file is uploaded", async () => {
  mock.method(s3Storage, "send", () => assert.fail("must not upload"));
  const file = { buffer: Buffer.from("x"), originalname: "a.png", mimetype: "image/png", size: 1 };

  mock.method(User, "findById", () => query(null));
  assert.equal((await call(sendMessage, { params: { id: bob._id }, file })).statusCode, 404);

  mock.method(User, "findById", () => query({ _id: bob._id }));
  mock.method(Block, "exists", async () => ({}));
  const blocked = await call(sendMessage, { params: { id: bob._id }, file, body: { text: "hi" } });
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.body.code, "MESSAGE_NOT_ALLOWED");

  mock.method(Block, "exists", async () => null);
  mock.method(Friendship, "exists", async () => null);
  mock.method(Message, "exists", async () => null);
  const stranger = await call(sendMessage, { params: { id: bob._id }, file, body: { text: "hi" } });
  assert.equal(stranger.statusCode, 403);
  assert.equal(stranger.body.code, "MESSAGE_FRIENDS_ONLY");
});

test("people who hide their status are left out of the online list", async () => {
  mock.method(User, "find", () => ({ distinct: async () => [bob._id] }));

  assert.deepEqual(await visibleOnlineUsers([ada._id, bob._id]), [ada._id]);
  assert.deepEqual(await visibleOnlineUsers([]), []);
});

test("a conversation can ask whether it may be written in, without revealing a block", async () => {
  const state = { blocked: false, friends: false };
  mock.method(User, "findById", () => query({ _id: bob._id }));
  mock.method(Block, "exists", async () => (state.blocked ? {} : null));
  mock.method(Friendship, "exists", async () => (state.friends ? {} : null));
  const ask = async () => (await call(privacy.getMessaging, { params: { id: bob._id } })).body;

  assert.deepEqual(await ask(), { canMessage: false, reason: "FRIENDS_ONLY", requestId: "req" });
  state.friends = true;
  assert.deepEqual(await ask(), { canMessage: true, requestId: "req" });
  state.blocked = true;
  assert.deepEqual(await ask(), { canMessage: false, reason: "UNAVAILABLE", requestId: "req" });

  mock.method(User, "findById", () => query(null));
  assert.equal((await call(privacy.getMessaging, { params: { id: bob._id } })).statusCode, 404);
});
