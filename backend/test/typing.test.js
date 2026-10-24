import assert from "node:assert/strict";
import { after, afterEach, beforeEach, mock, test } from "node:test";

// Typing signals between two people. Queries are stubbed; no real DB.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";

const { default: User } = await import("../src/models/user.model.js");
const { default: Block } = await import("../src/models/block.model.js");
const { default: Friendship } = await import("../src/models/friendship.model.js");
const { default: logger } = await import("../src/config/logger.js");
const {
  TYPING_MIN_INTERVAL_MS,
  TYPING_PERMISSION_TTL_MS,
  createTypingState,
  relayTyping,
  stopAllTyping,
} = await import("../src/services/typing.service.js");
const { io } = await import("../src/config/socket.js");

logger.silent = true;
after(() => io.close());

const me = "507f1f77bcf86cd799439011";
const peer = "507f1f77bcf86cd799439012";
const leanQuery = (result) => {
  const query = { select: () => query, lean: () => Promise.resolve(result) };
  return query;
};

let events;
let state;
let blocked;
let receiver;
const emit = (room, event, data) => events.push({ room, event, data });
const signal = (isTyping, now, to = peer) => relayTyping(state, me, { to, isTyping }, emit, now);

beforeEach(() => {
  events = [];
  state = createTypingState();
  blocked = false;
  receiver = { _id: peer, privacy: { allowMessagesFrom: "everyone" } };
  mock.method(User, "findById", () => leanQuery(receiver));
  mock.method(Block, "exists", () => Promise.resolve(blocked ? { _id: "b" } : null));
  mock.method(Friendship, "exists", () => Promise.resolve(null));
});
afterEach(() => mock.restoreAll());

test("typing and its stop go to the other person's room", async () => {
  assert.equal(await signal(true, 1000), true);
  assert.equal(await signal(false, 2000), true);

  assert.deepEqual(events, [
    { room: `user:${peer}`, event: "typing", data: { userId: me, isTyping: true } },
    { room: `user:${peer}`, event: "typing", data: { userId: me, isTyping: false } },
  ]);
});

test("someone who may not be messaged never sees typing", async () => {
  blocked = true;
  assert.equal(await signal(true, 1000), false);

  blocked = false;
  receiver = { _id: peer, privacy: { allowMessagesFrom: "friends" } };
  const later = createTypingState();
  assert.equal(await relayTyping(later, me, { to: peer, isTyping: true }, emit, 1000), false);

  receiver = null;
  assert.equal(await relayTyping(createTypingState(), me, { to: peer, isTyping: true }, emit, 1000), false);
  assert.equal(events.length, 0);
});

test("repeated signals are thinned out and the permission is reused for a while", async () => {
  await signal(true, 1000);
  assert.equal(await signal(true, 1000 + TYPING_MIN_INTERVAL_MS - 1), false);
  assert.equal(await signal(true, 1000 + TYPING_MIN_INTERVAL_MS), true);
  assert.equal(User.findById.mock.callCount(), 1);

  // A block placed later is noticed once the remembered answer expires.
  blocked = true;
  assert.equal(await signal(true, 1000 + TYPING_PERMISSION_TTL_MS + 1), false);
  assert.equal(User.findById.mock.callCount(), 2);
});

test("a stop is only sent to someone who was told about typing", async () => {
  assert.equal(await signal(false, 1000), false);
  assert.equal(events.length, 0);
});

test("malformed signals and signals to yourself are ignored", async () => {
  for (const payload of [null, "x", { to: peer }, { to: "nope", isTyping: true }, { to: peer, isTyping: "yes" }]) {
    assert.equal(await relayTyping(state, me, payload, emit, 1000), false);
  }
  assert.equal(await signal(true, 1000, me), false);
  assert.equal(User.findById.mock.callCount(), 0);
});

test("a socket that disconnects stops typing for everyone it told", async () => {
  const other = "507f1f77bcf86cd799439013";
  await signal(true, 1000);
  await signal(true, 1000, other);
  events = [];

  stopAllTyping(state, me, emit);

  assert.deepEqual(events.map(({ room, data }) => [room, data.isTyping]), [
    [`user:${peer}`, false],
    [`user:${other}`, false],
  ]);
  stopAllTyping(state, me, emit);
  assert.equal(events.length, 2, "nothing left to stop");
});
