import assert from "node:assert/strict";
import { after, afterEach, beforeEach, mock, test } from "node:test";

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
const { default: ChatDeletion } = await import("../src/models/chatDeletion.model.js");
const { default: ChatMute } = await import("../src/models/chatMute.model.js");
const { default: ChatHide } = await import("../src/models/chatHide.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { buildChatSummariesPipeline, LAST_MESSAGE_PREVIEW_LENGTH } =
  await import("../src/services/chat.service.js");
const { deleteChat, getChats, getMessagesById, hideChat, muteChat, unhideChat, unmuteChat } =
  await import("../src/controllers/message.controller.js");
const { io } = await import("../src/config/socket.js");
const { s3Storage } = await import("../src/config/storage.js");

logger.silent = true;

// Query chains end in .lean(); `result` is what the chain resolves to.
const leanQuery = (result) => {
  const query = { select: () => query, lean: () => Promise.resolve(result) };
  return query;
};

// Every test starts with no deleted or muted chats; their tests replace these.
let deletions;
let mutes;
let hides;
beforeEach(() => {
  deletions = [];
  mutes = [];
  hides = [];
  mock.method(ChatMute, "find", () => leanQuery(mutes));
  mock.method(ChatHide, "find", () => leanQuery(hides));
  mock.method(ChatDeletion, "find", (filter) =>
    leanQuery(deletions.filter((d) => !filter.userId || String(d.userId) === String(filter.userId))));
  mock.method(ChatDeletion, "findOne", ({ userId, peerId }) =>
    leanQuery(deletions.find((d) => String(d.userId) === String(userId) && String(d.peerId) === String(peerId)) ?? null));
});
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
  assert.deepEqual(res.body, { chats: [], unreadCounts: {}, mutes: {}, requestId: "req-1" });
});

test("aggregation matches on ObjectIds, since aggregate() does not cast strings", () => {
  const [match] = buildChatSummariesPipeline(myId);
  const [sent, received] = match.$match.$or;

  assert.ok(sent.senderId instanceof mongoose.Types.ObjectId);
  assert.ok(received.receiverId instanceof mongoose.Types.ObjectId);
  assert.equal(String(sent.senderId), myId);
});

test("pipeline sorts on the indexed keys and only exposes public partner fields and deletion", () => {
  const pipeline = buildChatSummariesPipeline(myId);
  const sort = pipeline.find((stage) => stage.$sort).$sort;
  const lookup = pipeline.find((stage) => stage.$lookup).$lookup;
  const indexes = Message.schema.indexes().map(([keys]) => keys);

  assert.deepEqual(sort, { createdAt: -1, _id: -1 });
  assert.deepEqual(indexes.filter((keys) => "createdAt" in keys), [
    { senderId: 1, createdAt: -1, _id: -1 },
    { receiverId: 1, createdAt: -1, _id: -1 },
  ]);
  assert.deepEqual(lookup.pipeline, [{ $project: { fullName: 1, profilePic: 1, deletedAt: 1 } }]);
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

test("a conversation loads its newest page on the indexed keys and returns it oldest first", async () => {
  const createdAt = new Date("2026-10-20T10:00:00Z");
  const newestFirst = [{ _id: "507f1f77bcf86cd7994390b2", createdAt }, { _id: "507f1f77bcf86cd7994390b1", createdAt }];
  let sortedBy;
  let limitedTo;
  mock.method(Message, "find", () => ({
    sort(order) {
      sortedBy = order;
      return { limit(count) { limitedTo = count; return Promise.resolve(newestFirst); } };
    },
  }));

  const res = response();
  await getMessagesById({ user: { _id: myId }, params: { id: partnerId }, query: {}, requestId: "req-4" }, res);

  assert.deepEqual(sortedBy, { createdAt: -1, _id: -1 });
  // One more than a page, to tell whether anything older is left.
  assert.equal(limitedTo, 31);
  assert.deepEqual(res.body, { messages: [...newestFirst].reverse(), hasMore: false, nextCursor: null, requestId: "req-4" });
});

test("messages from a deleted chat are skipped before the list is grouped", async () => {
  const deletedBefore = new Date("2026-10-20T10:00:00Z");
  deletions = [{ userId: myId, peerId: partnerId, deletedBefore }];
  const aggregate = mock.method(Message, "aggregate", () => Promise.resolve([]));

  await getChats({ user: { _id: myId }, requestId: "req-5" }, response());

  const [, skip, sort] = aggregate.mock.calls[0].arguments[0];
  const [rule] = skip.$match.$nor;
  assert.equal(String(rule.$or[0].senderId), partnerId);
  assert.equal(String(rule.$or[1].receiverId), partnerId);
  assert.deepEqual(rule.createdAt, { $lte: deletedBefore });
  // Still filtered before the sort, so the indexes are used as before.
  assert.deepEqual(sort.$sort, { createdAt: -1, _id: -1 });
});

test("a deleted conversation only loads messages sent after the deletion", async () => {
  const deletedBefore = new Date("2026-10-20T10:00:00Z");
  deletions = [{ userId: myId, peerId: partnerId, deletedBefore }];
  let filter;
  mock.method(Message, "find", (query) => {
    filter = query;
    return { sort: () => ({ limit: () => Promise.resolve([]) }) };
  });

  await getMessagesById({ user: { _id: myId }, params: { id: partnerId }, query: {}, requestId: "req-6" }, response());

  assert.deepEqual(filter.createdAt, { $gt: deletedBefore });
});

const deleteRequest = (peer = partnerId) => ({ user: { _id: myId }, params: { id: peer }, requestId: "req-del" });

const trackSocketEvents = () => {
  const events = [];
  mock.method(io, "to", (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }));
  return events;
};

test("deleting a chat hides it for me only and tells only my own tabs", async () => {
  const upsert = mock.method(ChatDeletion, "updateOne", () => Promise.resolve({}));
  const deleteMany = mock.method(Message, "deleteMany", () => assert.fail("one side deleting must not remove messages"));
  deletions = [];
  const events = trackSocketEvents();

  const res = response();
  await deleteChat(deleteRequest(), res);

  assert.equal(res.statusCode, 200);
  const [filter, update, options] = upsert.mock.calls[0].arguments;
  assert.deepEqual(filter, { userId: myId, peerId: partnerId });
  assert.ok(update.$set.deletedBefore instanceof Date);
  assert.deepEqual(options, { upsert: true });
  assert.equal(deleteMany.mock.callCount(), 0);
  assert.deepEqual(events.map(({ room, event }) => [room, event]), [[`user:${myId}`, "chat:deleted"]]);
  assert.equal(events[0].payload.userId, partnerId);
});

test("once both people deleted, what they both deleted is removed with its files", async () => {
  const theirs = new Date("2026-10-20T10:00:00Z");
  mock.method(ChatDeletion, "updateOne", (filter, { $set }) => {
    deletions.push({ ...filter, deletedBefore: $set.deletedBefore });
    return Promise.resolve({});
  });
  deletions = [{ userId: partnerId, peerId: myId, deletedBefore: theirs }];
  let fileFilter;
  mock.method(Message, "find", (filter) => {
    fileFilter = filter;
    return { distinct: () => Promise.resolve(["https://cdn.test/storage/v1/object/public/bucket/message-files/a.png"]) };
  });
  const deleteMany = mock.method(Message, "deleteMany", () => Promise.resolve({ deletedCount: 4 }));
  const send = mock.method(s3Storage, "send", () => Promise.resolve({}));
  trackSocketEvents();

  const res = response();
  await deleteChat(deleteRequest(), res);

  assert.equal(res.statusCode, 200);
  // Only up to the earlier deletion; they still see what came after it.
  const [filter] = deleteMany.mock.calls[0].arguments;
  assert.deepEqual(filter.createdAt, { $lte: theirs });
  assert.deepEqual(filter.$or.map(({ senderId }) => String(senderId)), [myId, partnerId]);
  assert.deepEqual(fileFilter.image, { $nin: [null, ""] });
  assert.equal(send.mock.callCount(), 1);
  assert.equal(send.mock.calls[0].arguments[0].input.Key, "message-files/a.png");
});

test("a file that can't be removed from storage doesn't fail the deletion", async () => {
  mock.method(ChatDeletion, "updateOne", (filter, { $set }) => {
    deletions.push({ ...filter, deletedBefore: $set.deletedBefore });
    return Promise.resolve({});
  });
  deletions = [{ userId: partnerId, peerId: myId, deletedBefore: new Date("2026-10-20T10:00:00Z") }];
  mock.method(Message, "find", () => ({ distinct: () => Promise.resolve(["https://cdn.test/storage/v1/object/public/bucket/x.png"]) }));
  mock.method(Message, "deleteMany", () => Promise.resolve({ deletedCount: 1 }));
  mock.method(s3Storage, "send", () => Promise.reject(new Error("bucket down")));
  trackSocketEvents();

  const res = response();
  await deleteChat(deleteRequest(), res);

  assert.equal(res.statusCode, 200);
});

test("a chat with yourself can't be deleted", async () => {
  const upsert = mock.method(ChatDeletion, "updateOne", () => assert.fail("must not save"));

  const res = response();
  await deleteChat(deleteRequest(myId), res);

  assert.equal(res.statusCode, 400);
  assert.equal(upsert.mock.callCount(), 0);
});

const muteRequest = (body, peer = partnerId) => ({ user: { _id: myId }, params: { id: peer }, body, requestId: "req-mute" });

test("muting saves an end time for timed mutes and none for until-turned-back-on", async () => {
  const upsert = mock.method(ChatMute, "updateOne", () => Promise.resolve({}));
  const events = trackSocketEvents();

  const before = Date.now();
  const res = response();
  await muteChat(muteRequest({ duration: "8h" }), res);

  assert.equal(res.statusCode, 200);
  const [filter, update, options] = upsert.mock.calls[0].arguments;
  assert.deepEqual(filter, { userId: myId, peerId: partnerId });
  assert.deepEqual(options, { upsert: true });
  const ends = update.$set.mutedUntil.getTime() - before;
  assert.ok(ends >= 8 * 3600 * 1000 && ends < 8 * 3600 * 1000 + 5000);
  // Only the user's own tabs hear about it.
  assert.deepEqual(events.map(({ room, event }) => [room, event]), [[`user:${myId}`, "chat:muted"]]);

  const forever = response();
  await muteChat(muteRequest({ duration: "forever" }), forever);
  assert.equal(upsert.mock.calls[1].arguments[1].$set.mutedUntil, null);
  assert.equal(forever.body.mutedUntil, null);
});

test("mute requests are validated", async () => {
  mock.method(ChatMute, "updateOne", () => assert.fail("must not save"));

  for (const body of [{}, { duration: "2h" }, { duration: "1h", extra: true }]) {
    const res = response();
    await muteChat(muteRequest(body), res);
    assert.equal(res.statusCode, 400);
  }
  const self = response();
  await muteChat(muteRequest({ duration: "1h" }, myId), self);
  assert.equal(self.statusCode, 400);
});

test("unmuting removes the mute and tells only my own tabs", async () => {
  const remove = mock.method(ChatMute, "deleteOne", () => Promise.resolve({ deletedCount: 1 }));
  const events = trackSocketEvents();

  const res = response();
  await unmuteChat(muteRequest(undefined), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(remove.mock.calls[0].arguments[0], { userId: myId, peerId: partnerId });
  assert.deepEqual(events.map(({ room, event }) => [room, event]), [[`user:${myId}`, "chat:unmuted"]]);
});

test("the chat list carries the mutes still in force", async () => {
  const until = new Date(Date.now() + 3600 * 1000);
  mutes = [
    { peerId: partnerId, mutedUntil: until },
    { peerId: quietPartnerId, mutedUntil: null },
  ];
  let filter;
  ChatMute.find.mock.mockImplementation((query) => {
    filter = query;
    return leanQuery(mutes);
  });
  mock.method(Message, "aggregate", () => Promise.resolve([]));

  const res = response();
  await getChats({ user: { _id: myId }, requestId: "req-7" }, res);

  assert.deepEqual(res.body.mutes, { [partnerId]: until.toISOString(), [quietPartnerId]: null });
  // Ended mutes are left out even before the TTL index removes them.
  assert.ok(filter.$or.some((rule) => rule.mutedUntil?.$gt instanceof Date));
});

test("a hidden chat is marked until a message newer than the hiding arrives", async () => {
  const hiddenAt = new Date("2026-10-20T12:00:00Z");
  hides = [
    { peerId: partnerId, hiddenAt },
    { peerId: quietPartnerId, hiddenAt },
  ];
  const at = (iso) => ({ _id: "m", senderId: partnerId, text: "hi", hasAttachment: false, createdAt: new Date(iso) });
  mock.method(Message, "aggregate", () => Promise.resolve([
    { _id: partnerId, fullName: "Ada", profilePic: "", unreadCount: 0, lastMessage: at("2026-10-20T11:00:00Z") },
    { _id: quietPartnerId, fullName: "Bo", profilePic: "", unreadCount: 1, lastMessage: at("2026-10-20T13:00:00Z") },
  ]));

  const res = response();
  await getChats({ user: { _id: myId }, requestId: "req-8" }, res);

  assert.equal(res.body.chats[0].hidden, true);
  assert.equal("hidden" in res.body.chats[1], false, "a newer message brought it back");
});

test("hiding and unhiding change only my own list", async () => {
  const upsert = mock.method(ChatHide, "updateOne", () => Promise.resolve({}));
  const remove = mock.method(ChatHide, "deleteOne", () => Promise.resolve({ deletedCount: 1 }));
  const events = trackSocketEvents();

  const hidden = response();
  await hideChat(muteRequest(undefined), hidden);
  const unhidden = response();
  await unhideChat(muteRequest(undefined), unhidden);
  const self = response();
  await hideChat(muteRequest(undefined, myId), self);

  assert.equal(hidden.statusCode, 200);
  const [filter, update, options] = upsert.mock.calls[0].arguments;
  assert.deepEqual(filter, { userId: myId, peerId: partnerId });
  assert.ok(update.$set.hiddenAt instanceof Date);
  assert.deepEqual(options, { upsert: true });
  assert.equal(unhidden.statusCode, 200);
  assert.deepEqual(remove.mock.calls[0].arguments[0], { userId: myId, peerId: partnerId });
  assert.equal(self.statusCode, 400);
  assert.equal(upsert.mock.callCount(), 1);
  assert.deepEqual(events.map(({ room, event }) => [room, event]), [
    [`user:${myId}`, "chat:hidden"],
    [`user:${myId}`, "chat:unhidden"],
  ]);
});
