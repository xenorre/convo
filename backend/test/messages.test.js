import assert from "node:assert/strict";
import { after, afterEach, beforeEach, mock, test } from "node:test";

// Editing and deleting single messages. Every query is stubbed; these tests
// never use a developer's DB, storage, Redis or email configuration.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";

const { default: mongoose } = await import("mongoose");
const { default: Message } = await import("../src/models/message.model.js");
const { default: ChatDeletion } = await import("../src/models/chatDeletion.model.js");
const { default: User } = await import("../src/models/user.model.js");
const { default: Block } = await import("../src/models/block.model.js");
const { default: Friendship } = await import("../src/models/friendship.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { buildChatSummariesPipeline } = await import("../src/services/chat.service.js");
const { EDIT_WINDOW_MS } = await import("../src/services/message.service.js");
const { deleteMessage, editMessage, getMessagesById } = await import("../src/controllers/message.controller.js");
const { io } = await import("../src/config/socket.js");
const { s3Storage } = await import("../src/config/storage.js");

logger.silent = true;
after(() => io.close());

const me = "507f1f77bcf86cd799439011";
const peer = "507f1f77bcf86cd799439012";
const messageId = "507f1f77bcf86cd799439099";
const fileUrl = "https://cdn.test/storage/v1/object/public/bucket/message-files/a.png";

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
});

const leanQuery = (result) => {
  const query = { select: () => query, lean: () => Promise.resolve(result) };
  return query;
};

const stored = (fields = {}) =>
  new Message({
    _id: messageId,
    senderId: me,
    receiverId: peer,
    text: "helo",
    createdAt: new Date(Date.now() - 60 * 1000),
    readAt: null,
    ...fields,
  });

let events;
let current;
let blocked;
beforeEach(() => {
  events = [];
  current = stored();
  blocked = false;
  mock.method(io, "to", (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }));
  mock.method(ChatDeletion, "findOne", () => leanQuery(null));
  mock.method(Message, "findOne", () => Promise.resolve(current));
  mock.method(Message, "findById", () => Promise.resolve(current));
  mock.method(User, "findById", () => leanQuery({ _id: peer, privacy: { allowMessagesFrom: "everyone" } }));
  mock.method(Block, "exists", () => Promise.resolve(blocked ? { _id: "b" } : null));
  mock.method(Friendship, "exists", () => Promise.resolve(null));
});
afterEach(() => mock.restoreAll());

const edit = async (text, user = me) => {
  const res = response();
  await editMessage({ user: { _id: user }, params: { id: messageId }, body: { text }, requestId: "req" }, res);
  return res;
};

const remove = async (scope, user = me) => {
  const res = response();
  await deleteMessage({ user: { _id: user }, params: { id: messageId }, query: scope ? { for: scope } : {}, requestId: "req" }, res);
  return res;
};

test("the sender edits within 15 minutes and both people get the new text", async () => {
  const update = mock.method(Message, "findOneAndUpdate", (filter, change) => {
    current = stored({ text: change.$set.text, editedAt: change.$set.editedAt });
    return Promise.resolve(current);
  });

  const res = await edit("  hello  ");

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message.text, "hello");
  assert.ok(res.body.message.editedAt);
  const [filter] = update.mock.calls[0].arguments;
  assert.equal(filter.senderId, me);
  assert.equal(filter.deletedAt, null);
  assert.ok(filter.createdAt.$gte instanceof Date, "the window is checked again in the write");
  assert.deepEqual(events.map(({ room, event }) => [room, event]), [
    [`user:${me}`, "message:updated"],
    [`user:${peer}`, "message:updated"],
  ]);
});

test("only the sender can edit, only for 15 minutes, and never a deleted message", async () => {
  const update = mock.method(Message, "findOneAndUpdate", () => assert.fail("must not write"));

  assert.equal((await edit("hi", peer)).statusCode, 403);

  current = stored({ createdAt: new Date(Date.now() - EDIT_WINDOW_MS - 1000) });
  const late = await edit("hi");
  assert.equal(late.statusCode, 409);
  assert.equal(late.body.code, "MESSAGE_EDIT_WINDOW_PASSED");

  current = stored({ text: undefined, deletedAt: new Date() });
  assert.equal((await edit("hi")).statusCode, 409);

  assert.equal(update.mock.callCount(), 0);
  assert.equal(events.length, 0);
});

test("an edit follows the same messaging rules as sending", async () => {
  const update = mock.method(Message, "findOneAndUpdate", () => assert.fail("must not write"));
  blocked = true;

  const res = await edit("hi");

  assert.equal(res.statusCode, 403);
  assert.deepEqual(
    { error: res.body.error, code: res.body.code },
    { error: "You can't message this person", code: "MESSAGE_NOT_ALLOWED" }
  );
  assert.equal(update.mock.callCount(), 0);
});

test("edits are validated: not too long, and text can only be emptied next to a file", async () => {
  mock.method(Message, "findOneAndUpdate", () => assert.fail("must not write"));

  assert.equal((await edit("x".repeat(2001))).statusCode, 400);
  assert.equal((await edit(42)).statusCode, 400);
  const empty = await edit("   ");
  assert.equal(empty.statusCode, 400);
  assert.equal(empty.body.code, "MESSAGE_EMPTY");
});

test("an unchanged edit is not marked as edited", async () => {
  mock.method(Message, "findOneAndUpdate", () => assert.fail("must not write"));

  const res = await edit("helo");

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message.editedAt, null);
});

test("deleting for everyone leaves a placeholder, removes the file and tells both people", async () => {
  current = stored({ image: fileUrl });
  const update = mock.method(Message, "findOneAndUpdate", (filter, change) => {
    const before = current;
    current = stored({ text: undefined, image: undefined, deletedAt: change.$set.deletedAt });
    return Promise.resolve(before);
  });
  const send = mock.method(s3Storage, "send", () => Promise.resolve({}));

  const res = await remove("everyone");

  assert.equal(res.statusCode, 200);
  const [, change] = update.mock.calls[0].arguments;
  assert.deepEqual(change.$unset, { text: 1, image: 1, editedAt: 1 });
  assert.equal(res.body.message.text, undefined);
  assert.ok(res.body.message.deletedAt);
  assert.equal(send.mock.calls[0].arguments[0].input.Key, "message-files/a.png");
  assert.deepEqual(events.map(({ room, event }) => [room, event]), [
    [`user:${me}`, "message:deleted"],
    [`user:${peer}`, "message:deleted"],
  ]);
  assert.equal(events[1].payload.wasUnread, true);
});

test("deleting for everyone skips whoever already deleted it for themselves", async () => {
  current = stored({ hiddenFor: [peer] });
  mock.method(Message, "findOneAndUpdate", () => {
    const before = current;
    current = stored({ text: undefined, deletedAt: new Date(), hiddenFor: [peer] });
    return Promise.resolve(before);
  });

  await remove("everyone");

  assert.deepEqual(events.map(({ room }) => room), [`user:${me}`]);
});

test("only the sender can delete for everyone; a storage failure doesn't fail it", async () => {
  mock.method(Message, "findOneAndUpdate", () => assert.fail("must not write"));
  assert.equal((await remove("everyone", peer)).statusCode, 403);
  mock.restoreAll();

  // A fresh set of stubs for the storage failure.
  events = [];
  mock.method(io, "to", (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }));
  mock.method(ChatDeletion, "findOne", () => leanQuery(null));
  current = stored({ image: fileUrl });
  mock.method(Message, "findOne", () => Promise.resolve(current));
  mock.method(Message, "findById", () => Promise.resolve(stored({ text: undefined, deletedAt: new Date() })));
  mock.method(Message, "findOneAndUpdate", () => Promise.resolve(current));
  mock.method(s3Storage, "send", () => Promise.reject(new Error("bucket down")));

  assert.equal((await remove("everyone")).statusCode, 200);
});

test("deleting for me hides it for me only and tells only my own tabs", async () => {
  const update = mock.method(Message, "findOneAndUpdate", (filter, change) =>
    Promise.resolve(stored({ hiddenFor: [change.$addToSet.hiddenFor] })));
  const deleteOne = mock.method(Message, "deleteOne", () => assert.fail("the other person still has it"));

  const res = await remove(undefined, peer);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(update.mock.calls[0].arguments[1], { $addToSet: { hiddenFor: peer } });
  assert.equal(deleteOne.mock.callCount(), 0);
  assert.deepEqual(events.map(({ room, event }) => [room, event]), [[`user:${peer}`, "message:hidden"]]);
  assert.deepEqual(events[0].payload, { messageId, peerId: me });
});

test("once both people deleted a message for themselves it is removed with its file", async () => {
  current = stored({ image: fileUrl, hiddenFor: [peer] });
  mock.method(Message, "findOneAndUpdate", () => Promise.resolve(stored({ image: fileUrl, hiddenFor: [peer, me] })));
  const deleteOne = mock.method(Message, "deleteOne", () => Promise.resolve({ deletedCount: 1 }));
  const send = mock.method(s3Storage, "send", () => Promise.resolve({}));

  const res = await remove("me");

  assert.equal(res.statusCode, 200);
  assert.equal(String(deleteOne.mock.calls[0].arguments[0]._id), messageId);
  assert.equal(send.mock.callCount(), 1);
});

test("a message from someone else's chat, or one I already deleted, is not found", async () => {
  mock.method(Message, "findOne", () => Promise.resolve(null));

  const res = await remove("me");

  assert.equal(res.statusCode, 404);
  assert.equal(events.length, 0);
});

test("a message from a chat I deleted can't be changed", async () => {
  mock.method(ChatDeletion, "findOne", () => leanQuery({ deletedBefore: new Date() }));
  mock.method(Message, "findOneAndUpdate", () => assert.fail("must not write"));

  assert.equal((await edit("hi")).statusCode, 404);
  assert.equal((await remove("everyone")).statusCode, 404);
});

test("an unknown delete scope is rejected", async () => {
  assert.equal((await remove("them")).statusCode, 400);
});

test("who deleted a message for themselves never reaches the client", () => {
  const json = stored({ hiddenFor: [peer] }).toJSON();

  assert.equal("hiddenFor" in json, false);
});

test("lists and conversations leave out messages I deleted, and deleted ones don't count as unread", async () => {
  const [first] = buildChatSummariesPipeline(me);
  assert.ok(first.$match.hiddenFor.$ne instanceof mongoose.Types.ObjectId);
  assert.equal(String(first.$match.hiddenFor.$ne), me);

  const pipeline = JSON.stringify(buildChatSummariesPipeline(me));
  assert.ok(pipeline.includes('"$deletedAt"'), "unread ignores deleted messages");
  assert.ok(pipeline.includes('"deleted"'), "the preview says when the last message was deleted");

  let filter;
  mock.method(Message, "find", (query) => {
    filter = query;
    return { sort: () => Promise.resolve([]) };
  });
  await getMessagesById({ user: { _id: me }, params: { id: peer }, requestId: "req" }, response());
  assert.deepEqual(filter.hiddenFor, { $ne: me });
});
