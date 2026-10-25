import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

// Loading a conversation a page at a time. Queries are stubbed.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";

const { default: Message } = await import("../src/models/message.model.js");
const { default: ChatDeletion } = await import("../src/models/chatDeletion.model.js");
const { default: User } = await import("../src/models/user.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { decodeMessageCursor, encodeMessageCursor } = await import("../src/services/message.service.js");
const { getMessagesById } = await import("../src/controllers/message.controller.js");
const { io } = await import("../src/config/socket.js");

logger.silent = true;
afterEach(() => mock.restoreAll());
after(() => io.close());

const me = "507f1f77bcf86cd799439011";
const peer = "507f1f77bcf86cd799439012";
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
});

// `count` messages a second apart, newest first like the database returns.
const newestFirst = (count, start = Date.parse("2026-10-20T10:00:00Z")) =>
  Array.from({ length: count }, (_, i) => ({
    _id: (0x507f1f77bcf86cd799439100n + BigInt(count - i)).toString(16),
    senderId: peer,
    receiverId: me,
    createdAt: new Date(start + (count - i) * 1000),
  }));

const stubFind = (result) => {
  const calls = [];
  mock.method(ChatDeletion, "findOne", () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }));
  mock.method(User, "find", () => ({ select: () => ({ lean: () => Promise.resolve([]) }) }));
  mock.method(Message, "find", (filter) => {
    const call = { filter };
    calls.push(call);
    return { sort: (order) => ({ limit: (count) => { Object.assign(call, { order, count }); return Promise.resolve(result.slice(0, count)); } }) };
  });
  return calls;
};

const load = async (query = {}) => {
  const res = response();
  await getMessagesById({ user: { _id: me }, params: { id: peer }, query, requestId: "req" }, res);
  return res;
};

test("a cursor survives the round trip and nothing else passes for one", () => {
  const message = { _id: "507f1f77bcf86cd799439111", createdAt: new Date("2026-10-20T10:00:00.123Z") };
  const decoded = decodeMessageCursor(encodeMessageCursor(message));
  assert.equal(decoded.createdAt.toISOString(), "2026-10-20T10:00:00.123Z");
  assert.equal(String(decoded._id), message._id);

  for (const forged of ["", "abc", Buffer.from("123:not-an-id").toString("base64url"), Buffer.from("x:507f1f77bcf86cd799439111").toString("base64url"), Buffer.from("1:507f1f77bcf86cd799439111:extra").toString("base64url")]) {
    assert.equal(decodeMessageCursor(forged), null, forged);
  }
});

test("a long conversation loads its newest 30 and says where the older ones start", async () => {
  stubFind(newestFirst(75));

  const res = await load();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.messages.length, 30);
  assert.equal(res.body.hasMore, true);
  // Oldest first on screen; the cursor points at the oldest one shown.
  const times = res.body.messages.map((m) => m.createdAt.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.equal(String(decodeMessageCursor(res.body.nextCursor)._id), String(res.body.messages[0]._id));
});

test("the next page asks only for what is older than the cursor", async () => {
  const calls = stubFind(newestFirst(5));
  const cursorAt = { _id: "507f1f77bcf86cd799439150", createdAt: new Date("2026-10-20T11:00:00Z") };

  const res = await load({ before: encodeMessageCursor(cursorAt), limit: "10" });

  const [{ filter, order, count }] = calls;
  assert.deepEqual(order, { createdAt: -1, _id: -1 });
  assert.equal(count, 11);
  const [older, sameTimeLowerId] = filter.$and[0].$or;
  assert.deepEqual(older, { createdAt: { $lt: cursorAt.createdAt } });
  assert.deepEqual(sameTimeLowerId.createdAt, cursorAt.createdAt);
  assert.equal(String(sameTimeLowerId._id.$lt), cursorAt._id);
  // Fewer than asked for: that was the start of the conversation.
  assert.deepEqual([res.body.messages.length, res.body.hasMore, res.body.nextCursor], [5, false, null]);
});

test("a forged cursor or an out-of-range page size is refused before any query", async () => {
  const calls = stubFind([]);
  for (const query of [{ before: "forged" }, { limit: "0" }, { limit: "51" }, { limit: "ten" }, { other: "x" }]) {
    const res = await load(query);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
    assert.equal(res.body.code, "MESSAGE_PAGE_INVALID");
  }
  assert.equal(calls.length, 0);
});
