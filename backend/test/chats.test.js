import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

// The aggregation itself runs in MongoDB; these tests stub it and never use a
// developer's DB, Redis, credentials, or outbound email configuration.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";

const { default: mongoose } = await import("mongoose");
const { default: Message } = await import("../src/models/message.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { buildChatSummariesPipeline, LAST_MESSAGE_PREVIEW_LENGTH } =
  await import("../src/services/chat.service.js");
const { getChats, getMessagesById } = await import("../src/controllers/message.controller.js");
const { io } = await import("../src/config/socket.js");

logger.silent = true;
afterEach(() => mock.restoreAll());
after(() => io.close());

const myId = "507f1f77bcf86cd799439011";
const partnerId = "507f1f77bcf86cd799439012";
const quietPartnerId = "507f1f77bcf86cd799439013";

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
});

test("chat list is one aggregation that never loads a message list into Node", async () => {
  mock.method(Message, "find", () => assert.fail("getChats must not call Message.find"));
  const aggregate = mock.method(Message, "aggregate", () => Promise.resolve([]));

  const res = response();
  await getChats({ user: { _id: myId }, requestId: "req-1" }, res);

  assert.equal(aggregate.mock.callCount(), 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { chats: [], unreadCounts: {}, requestId: "req-1" });
});

test("aggregation matches on ObjectIds, since aggregate() does not cast strings", () => {
  const [match] = buildChatSummariesPipeline(myId);
  const [sent, received] = match.$match.$or;

  assert.ok(sent.senderId instanceof mongoose.Types.ObjectId);
  assert.ok(received.receiverId instanceof mongoose.Types.ObjectId);
  assert.equal(String(sent.senderId), myId);
});

test("pipeline sorts on the indexed keys and only exposes public partner fields", () => {
  const pipeline = buildChatSummariesPipeline(myId);
  const sort = pipeline.find((stage) => stage.$sort).$sort;
  const lookup = pipeline.find((stage) => stage.$lookup).$lookup;
  const indexes = Message.schema.indexes().map(([keys]) => keys);

  assert.deepEqual(sort, { createdAt: -1, _id: -1 });
  assert.deepEqual(indexes.filter((keys) => "createdAt" in keys), [
    { senderId: 1, createdAt: -1, _id: -1 },
    { receiverId: 1, createdAt: -1, _id: -1 },
  ]);
  assert.deepEqual(lookup.pipeline, [{ $project: { fullName: 1, profilePic: 1 } }]);
  assert.equal(LAST_MESSAGE_PREVIEW_LENGTH, 120);
});

test("rows keep their order and unread counts move into the existing map", async () => {
  const lastMessage = {
    _id: "m1",
    senderId: partnerId,
    text: "hi",
    hasAttachment: false,
    createdAt: new Date("2026-10-20T10:00:00Z"),
  };
  mock.method(Message, "aggregate", () => Promise.resolve([
    { _id: partnerId, fullName: "Ada", profilePic: "a.png", unreadCount: 3, lastMessage },
    { _id: quietPartnerId, fullName: "Bo", profilePic: "b.png", unreadCount: 0, lastMessage },
  ]));

  const res = response();
  await getChats({ user: { _id: myId }, requestId: "req-2" }, res);

  assert.deepEqual(res.body.chats.map((chat) => chat._id), [partnerId, quietPartnerId]);
  assert.ok(res.body.chats.every((chat) => !("unreadCount" in chat)));
  assert.deepEqual(res.body.chats[0].lastMessage, lastMessage);
  assert.deepEqual(res.body.unreadCounts, { [partnerId]: 3 });
});

test("aggregation failure returns 500 without leaking the error", async () => {
  mock.method(Message, "aggregate", () => Promise.reject(new Error("db down")));

  const res = response();
  await getChats({ user: { _id: myId }, requestId: "req-3" }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Internal server error", requestId: "req-3" });
});

test("conversation messages are explicitly sorted oldest first", async () => {
  const messages = [{ _id: "m1" }, { _id: "m2" }];
  let sortedBy;
  mock.method(Message, "find", () => ({
    sort(order) { sortedBy = order; return Promise.resolve(messages); },
  }));

  const res = response();
  await getMessagesById({ user: { _id: myId }, params: { id: partnerId }, requestId: "req-4" }, res);

  assert.deepEqual(sortedBy, { createdAt: 1, _id: 1 });
  assert.deepEqual(res.body, { messages, requestId: "req-4" });
});
