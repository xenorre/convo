import assert from "node:assert/strict";
import { after, afterEach, beforeEach, mock, test } from "node:test";

// Read receipts: mutual, and never leaked to a sender when either side has
// them off. Every query is stubbed; no real DB.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";

const { default: Message } = await import("../src/models/message.model.js");
const { default: User } = await import("../src/models/user.model.js");
const { default: ChatDeletion } = await import("../src/models/chatDeletion.model.js");
const { default: Block } = await import("../src/models/block.model.js");
const { default: Friendship } = await import("../src/models/friendship.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { PRIVACY_DEFAULTS } = await import("../src/services/privacy.service.js");
const { privacyUpdateSchema } = await import("../src/validations/privacy.validation.js");
const { deleteMessage, editMessage, getMessagesById, markRead } =
  await import("../src/controllers/message.controller.js");
const { io } = await import("../src/config/socket.js");

logger.silent = true;
after(() => io.close());

const me = "507f1f77bcf86cd799439011";
const peer = "507f1f77bcf86cd799439012";
const messageId = "507f1f77bcf86cd799439099";
const readAt = new Date("2026-10-24T18:42:00Z");

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
});
const leanQuery = (result) => {
  const query = { select: () => query, lean: () => Promise.resolve(result) };
  return query;
};

let events;
let receipts; // { [userId]: boolean }
beforeEach(() => {
  events = [];
  receipts = { [me]: true, [peer]: true };
  mock.method(io, "to", (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }));
  mock.method(User, "find", () => leanQuery(Object.entries(receipts).map(([_id, readReceipts]) => ({ _id, privacy: { readReceipts } }))));
  mock.method(User, "findById", () => leanQuery({ _id: peer, privacy: { allowMessagesFrom: "everyone" } }));
  mock.method(ChatDeletion, "findOne", () => leanQuery(null));
  mock.method(Block, "exists", () => Promise.resolve(null));
  mock.method(Friendship, "exists", () => Promise.resolve(null));
});
afterEach(() => mock.restoreAll());

test("read receipts are on by default and can be switched off", () => {
  assert.equal(PRIVACY_DEFAULTS.readReceipts, true);
  assert.equal(privacyUpdateSchema.safeParse({ privacy: { readReceipts: false } }).success, true);
  assert.equal(privacyUpdateSchema.safeParse({ privacy: { readReceipts: "no" } }).success, false);
});

const markReadAs = async (reader, sender, modified = 2) => {
  const update = mock.method(Message, "updateMany", () => Promise.resolve({ modifiedCount: modified }));
  const res = response();
  await markRead({ user: { _id: reader }, params: { id: sender }, requestId: "req" }, res);
  return { res, update };
};

test("reading tells the sender's tabs when, if both share receipts", async () => {
  const { res, update } = await markReadAs(me, peer);

  assert.equal(res.statusCode, 200);
  const stamped = update.mock.calls[0].arguments[1].$set.readAt;
  assert.deepEqual(update.mock.calls[0].arguments[2], { timestamps: false }, "reading must not move updatedAt");
  assert.deepEqual(events, [{ room: `user:${peer}`, event: "messages:read", payload: { readerId: me, readAt: stamped } }]);
});

test("no receipt goes out when either side has them off, or nothing new was read", async () => {
  receipts[me] = false;
  await markReadAs(me, peer);
  receipts = { [me]: true, [peer]: false };
  await markReadAs(me, peer);
  receipts = { [me]: true, [peer]: true };
  await markReadAs(me, peer, 0);

  assert.equal(events.length, 0);
});

const sentAt = new Date("2026-10-24T18:40:00Z");
const conversation = () => [
  new Message({ _id: "507f1f77bcf86cd7994390a1", senderId: me, receiverId: peer, text: "mine", readAt, createdAt: sentAt, updatedAt: readAt }),
  new Message({ _id: "507f1f77bcf86cd7994390a2", senderId: peer, receiverId: me, text: "theirs", readAt }),
];
const loadConversation = async () => {
  // The database answers newest first.
  mock.method(Message, "find", () => ({ sort: () => ({ limit: () => Promise.resolve(conversation().reverse()) }) }));
  const res = response();
  await getMessagesById({ user: { _id: me }, params: { id: peer }, query: {}, requestId: "req" }, res);
  return res.body.messages;
};

test("a sender sees when their messages were read only with receipts on both sides", async () => {
  const summary = (messages) => messages.map((m) => [m.text, m.readAt ? "read" : null]);
  assert.deepEqual(summary(await loadConversation()), [["mine", "read"], ["theirs", "read"]]);

  receipts[peer] = false;
  const hidden = await loadConversation();
  // My own reading of their message is still mine to see.
  assert.deepEqual(summary(hidden), [["mine", null], ["theirs", "read"]]);
  // An older read moved updatedAt; it must not give the read time away either.
  assert.deepEqual(hidden[0].updatedAt, sentAt);
});

test("edits and deletions don't carry the read time to a sender without receipts", async () => {
  receipts[peer] = false;
  let current = new Message({
    _id: messageId, senderId: me, receiverId: peer, text: "helo", readAt, createdAt: new Date(Date.now() - 60000),
  });
  mock.method(Message, "findOne", () => Promise.resolve(current));
  mock.method(Message, "findOneAndUpdate", (filter, change) => {
    const before = current;
    current = new Message({ ...before.toObject(), ...(change.$set ?? {}), text: change.$set?.text });
    return Promise.resolve(change.$set?.deletedAt ? before : current);
  });
  mock.method(Message, "findById", () => Promise.resolve(current));

  const edited = response();
  await editMessage({ user: { _id: me }, params: { id: messageId }, body: { text: "hello" }, requestId: "req" }, edited);
  assert.equal(edited.body.message.readAt, null);
  const byRoom = Object.fromEntries(events.map(({ room, payload }) => [room, payload]));
  assert.equal(byRoom[`user:${me}`].message.readAt, null);
  assert.ok(byRoom[`user:${peer}`].message.readAt, "the reader still has their own read time");

  events = [];
  current = new Message({ ...current.toObject(), readAt: null });
  const deleted = response();
  await deleteMessage({ user: { _id: me }, params: { id: messageId }, query: { for: "everyone" }, requestId: "req" }, deleted);
  const deletedFor = Object.fromEntries(events.map(({ room, payload }) => [room, payload]));
  assert.equal(deletedFor[`user:${me}`].wasUnread, false, "the sender is never told whether it was read");
  assert.equal(deletedFor[`user:${peer}`].wasUnread, true);
});
