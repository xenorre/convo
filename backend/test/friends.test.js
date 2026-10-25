import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

// These tests stub every database operation and never use a developer's DB,
// Redis, credentials, or outbound email configuration.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";

const { default: User } = await import("../src/models/user.model.js");
const { default: Friendship, friendPairKey } = await import("../src/models/friendship.model.js");
const { default: Block } = await import("../src/models/block.model.js");
const { default: Message } = await import("../src/models/message.model.js");
const { default: logger } = await import("../src/config/logger.js");
const friends = await import("../src/controllers/friend.controller.js");
const { rateLimitPerUser } = await import("../src/middleware/rateLimit.middleware.js");
const { io } = await import("../src/config/socket.js");

logger.silent = true;
afterEach(() => mock.restoreAll());

// No blocks and no shared conversations unless a test says otherwise.
const noBlocksOrHistory = ({ blocked = false } = {}) => {
  mock.method(Block, "exists", async () => (blocked ? { _id: "block" } : null));
  mock.method(Block, "find", () => query([]));
  mock.method(Message, "distinct", async () => []);
};
after(() => io.close());

const ada = { _id: "507f1f77bcf86cd799439011", fullName: "Ada", profilePic: "/ada.png" };
const bob = { _id: "507f1f77bcf86cd799439012", fullName: "Bob", profilePic: "/bob.png" };
const requestDocId = "607f1f77bcf86cd799439099";

// A chainable stand-in for a Mongoose query that resolves to `value`.
const query = (value) => {
  const chain = {
    populate: () => chain,
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: () => Promise.resolve(value),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return chain;
};

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
  set(name, value) { this.headers = { ...this.headers, [name]: value }; return this; },
});

const captureSocket = () => {
  const events = [];
  mock.method(io, "to", (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }));
  return events;
};

const call = async (handler, { body = {}, params = {}, query: q = {}, user = ada } = {}) => {
  const res = response();
  await handler({ body, params, query: q, user: { ...user, id: user._id }, requestId: "req" }, res);
  return res;
};

test("sending a request stores it and tells the recipient who asked", async () => {
  noBlocksOrHistory();
  mock.method(User, "findOne", () => query(bob));
  mock.method(Friendship, "findOne", () => query(null));
  const create = mock.method(Friendship, "create", async (doc) => ({ _id: requestDocId, createdAt: "now", ...doc }));
  const events = captureSocket();

  const res = await call(friends.createFriendRequest, { body: { userId: bob._id } });

  assert.equal(res.statusCode, 201);
  assert.deepEqual(create.mock.calls[0].arguments[0], {
    requester: ada._id, recipient: bob._id, pairKey: friendPairKey(ada._id, bob._id),
  });
  assert.deepEqual(res.body.request, { friendRequestId: requestDocId, user: bob, createdAt: "now" });
  assert.equal(res.body.requestId, "req");
  assert.deepEqual(events, [{
    room: `user:${bob._id}`,
    event: "friend:request",
    payload: { request: { friendRequestId: requestDocId, user: ada, createdAt: "now" } },
  }]);
});

test("inviting someone who already invited you makes you friends", async () => {
  mock.method(User, "findOne", () => query(bob));
  mock.method(Friendship, "findOne", () => query({ _id: requestDocId, requester: bob._id, recipient: ada._id, status: "pending" }));
  const update = mock.method(Friendship, "findOneAndUpdate", () => query({ _id: requestDocId, status: "accepted" }));
  const events = captureSocket();

  const res = await call(friends.createFriendRequest, { body: { userId: bob._id } });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "accepted");
  assert.deepEqual(res.body.friend, bob);
  assert.deepEqual(update.mock.calls[0].arguments[0], { _id: requestDocId, status: "pending" });
  assert.deepEqual(events.map(({ room, event }) => [room, event]), [[`user:${bob._id}`, "friend:accepted"]]);
});

test("request errors map to clear status codes", async () => {
  const cases = [
    [{ userId: ada._id }, () => {}, 400, "FRIEND_SELF"],
    [{ userId: bob._id }, () => {
      mock.method(User, "findOne", () => query(null));
    }, 404, "FRIEND_USER_NOT_FOUND"],
    [{ userId: bob._id }, () => {
      mock.method(User, "findOne", () => query(bob));
      mock.method(Friendship, "findOne", () => query({ status: "accepted", requester: bob._id }));
    }, 409, "FRIEND_ALREADY_FRIENDS"],
    [{ userId: bob._id }, () => {
      mock.method(User, "findOne", () => query(bob));
      mock.method(Friendship, "findOne", () => query({ status: "pending", requester: ada._id }));
    }, 409, "FRIEND_ALREADY_REQUESTED"],
    [{ userId: bob._id }, () => {
      mock.method(User, "findOne", () => query(bob));
      mock.method(Friendship, "findOne", () => query(null));
      mock.method(Friendship, "create", async () => { throw Object.assign(new Error("dup"), { code: 11000 }); });
    }, 409, "FRIEND_ALREADY_REQUESTED"],
  ];

  for (const [body, arrange, status, code] of cases) {
    mock.restoreAll();
    noBlocksOrHistory();
    arrange();
    captureSocket();
    const res = await call(friends.createFriendRequest, { body });
    assert.equal(res.statusCode, status, code);
    assert.equal(res.body.code, code);
  }
});

test("malformed requests are rejected before any lookup", async () => {
  const findOne = mock.method(User, "findOne", () => assert.fail("must not query"));

  for (const body of [{}, { userId: "nope" }, { userId: bob._id, extra: 1 }]) {
    const res = await call(friends.createFriendRequest, { body });
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.equal(findOne.mock.callCount(), 0);
});

test("only the recipient can accept, and the requester hears about it", async () => {
  const update = mock.method(Friendship, "findOneAndUpdate", () => query({ _id: requestDocId, requester: bob._id }));
  const events = captureSocket();

  const res = await call(friends.acceptFriendRequest, { params: { id: requestDocId } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(update.mock.calls[0].arguments[0], { _id: requestDocId, status: "pending", recipient: ada._id });
  assert.deepEqual(events[0], {
    room: `user:${bob._id}`,
    event: "friend:accepted",
    payload: { friendRequestId: requestDocId, friend: ada },
  });

  mock.method(Friendship, "findOneAndUpdate", () => query(null));
  const missing = await call(friends.acceptFriendRequest, { params: { id: requestDocId } });
  assert.equal(missing.statusCode, 404);
});

test("declining and cancelling remove the request for the other side", async () => {
  const events = captureSocket();
  const remove = mock.method(Friendship, "findOneAndDelete", (filter) =>
    query({ _id: requestDocId, requester: filter.requester ?? bob._id, recipient: filter.recipient ?? bob._id }));

  const declined = await call(friends.declineFriendRequest, { params: { id: requestDocId } });
  const cancelled = await call(friends.cancelFriendRequest, { params: { id: requestDocId } });

  assert.equal(declined.statusCode, 200);
  assert.equal(cancelled.statusCode, 200);
  assert.deepEqual(remove.mock.calls.map((c) => c.arguments[0]), [
    { _id: requestDocId, recipient: ada._id, status: "pending" },
    { _id: requestDocId, requester: ada._id, status: "pending" },
  ]);
  assert.deepEqual(events.map(({ room, event }) => [room, event]), [
    [`user:${bob._id}`, "friend:request:removed"],
    [`user:${bob._id}`, "friend:request:removed"],
  ]);
});

test("removing a friend deletes only an accepted friendship", async () => {
  const events = captureSocket();
  const remove = mock.method(Friendship, "findOneAndDelete", () => query({ _id: requestDocId }));

  const res = await call(friends.deleteFriend, { params: { userId: bob._id } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(remove.mock.calls[0].arguments[0], { pairKey: friendPairKey(ada._id, bob._id), status: "accepted" });
  assert.deepEqual(events[0], { room: `user:${bob._id}`, event: "friend:removed", payload: { userId: ada._id } });

  mock.method(Friendship, "findOneAndDelete", () => query(null));
  assert.equal((await call(friends.deleteFriend, { params: { userId: bob._id } })).statusCode, 404);
});

test("the friends list and requests never include emails", async () => {
  mock.method(Friendship, "find", (filter) => query(filter.status === "accepted"
    ? [{ requester: { ...ada }, recipient: { ...bob, email: "bob@x.test" }, respondedAt: "then" },
       { requester: { ...ada }, recipient: null }]
    : [{ _id: requestDocId, requester: { ...bob, email: "bob@x.test" }, recipient: { ...ada }, createdAt: "now" }]));

  const list = await call(friends.getFriends);
  const requests = await call(friends.getFriendRequests);

  assert.deepEqual(list.body.friends, [{ ...bob, since: "then" }]);
  assert.deepEqual(requests.body.incoming, [{ friendRequestId: requestDocId, user: bob, createdAt: "now" }]);
  assert.deepEqual(requests.body.outgoing, []);
});

test("user search escapes the query and reports each relationship", async () => {
  noBlocksOrHistory();
  const find = mock.method(User, "find", () => query([{ ...bob }]));
  mock.method(Friendship, "find", () => query([
    { _id: requestDocId, pairKey: friendPairKey(ada._id, bob._id), status: "pending", requester: ada._id },
  ]));

  const res = await call(friends.searchForUsers, { query: { q: "  b(o)b  " } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(find.mock.calls[0].arguments[0], {
    _id: { $nin: [ada._id] },
    deletedAt: null,
    fullName: { $regex: "b\\(o\\)b", $options: "i" },
  });
  assert.deepEqual(res.body.users, [{
    ...bob,
    relationship: { state: "outgoing", friendRequestId: requestDocId },
    canRequest: false,
    canMessage: false,
  }]);

  for (const q of [undefined, "ab", "  a  ", "x".repeat(51)]) {
    assert.equal((await call(friends.searchForUsers, { query: { q } })).statusCode, 400, String(q));
  }
});

test("the per-user rate limit blocks a burst and resets after the window", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const limit = rateLimitPerUser({ windowMs: 1000, max: 2 });
  const run = (userId) => {
    const res = response();
    let passed = false;
    limit({ user: { id: userId } }, res, () => { passed = true; });
    return { passed, res };
  };

  assert.ok(run("a").passed);
  assert.ok(run("a").passed);
  const blocked = run("a");
  assert.equal(blocked.passed, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body.code, "RATE_LIMITED");
  assert.equal(blocked.res.headers["Retry-After"], "1");
  assert.ok(run("b").passed, "other users have their own budget");

  t.mock.timers.tick(1000);
  assert.ok(run("a").passed);
});

test("people who blocked or were blocked, or accept no requests, cannot be invited", async () => {
  for (const [arrange, why] of [
    [() => { noBlocksOrHistory({ blocked: true }); mock.method(User, "findOne", () => query(bob)); }, "block"],
    [() => {
      noBlocksOrHistory();
      mock.method(User, "findOne", () => query({ ...bob, privacy: { allowFriendRequestsFrom: "nobody" } }));
    }, "nobody"],
  ]) {
    mock.restoreAll();
    arrange();
    mock.method(Friendship, "findOne", () => query(null));
    const create = mock.method(Friendship, "create", async () => assert.fail("must not create"));
    captureSocket();

    const res = await call(friends.createFriendRequest, { body: { userId: bob._id } });

    assert.equal(res.statusCode, 403, why);
    // The same answer either way, so a block cannot be detected.
    assert.deepEqual(res.body.error, "This person isn't accepting friend requests");
    assert.equal(create.mock.callCount(), 0);
  }
});

test("search hides blocked people and tells the UI what it may offer", async () => {
  mock.method(Block, "find", () => query([{ blocker: ada._id, blocked: "blocked-by-me" }, { blocker: "blocked-me", blocked: ada._id }]));
  const cyd = { _id: "507f1f77bcf86cd799439013", fullName: "Cyd", profilePic: "" };
  const dee = { _id: "507f1f77bcf86cd799439014", fullName: "Dee", profilePic: "", privacy: { allowMessagesFrom: "everyone", allowFriendRequestsFrom: "nobody" } };
  const find = mock.method(User, "find", () => query([{ ...bob }, { ...cyd }, { ...dee }]));
  mock.method(Friendship, "find", () => query([]));

  const res = await call(friends.searchForUsers, { query: { q: "abc" } });

  assert.deepEqual(find.mock.calls[0].arguments[0]._id, { $nin: [ada._id, "blocked-by-me", "blocked-me"] });
  assert.deepEqual(res.body.users.map(({ fullName, canRequest, canMessage }) => [fullName, canRequest, canMessage]), [
    ["Bob", true, false],
    ["Cyd", true, false], // friends only, and not friends
    ["Dee", false, true], // accepts messages from everyone, requests from nobody
  ]);
  assert.ok(res.body.users.every((user) => !("privacy" in user)));
});
