import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { befriend, createUser, startApp } from "./harness.js";

// Conversations end to end: friends, sending, the chat list, paging, read
// receipts, edits and deletions, over HTTP against a real MongoDB.
let app;
let ann;
let bob;
before(async () => {
  app = await startApp();
  ann = await createUser(app, { fullName: "Ann Smith", email: "ann@example.com" });
  bob = await createUser(app, { fullName: "Bob Jones", email: "bob@example.com" });
});
after(() => app?.stop());

const send = (from, to, text) => from.client.post(`/api/v1/messages/send/${to.user._id}`, { text });
const conversation = (viewer, peer, query = "") => viewer.client.get(`/api/v1/messages/${peer.user._id}${query}`);

test("strangers can't write to each other until they are friends", async () => {
  const refused = await send(ann, bob, "Hi Bob");
  assert.equal(refused.status, 403);
  assert.equal(refused.body.code, "MESSAGE_FRIENDS_ONLY");
  assert.deepEqual((await ann.client.get(`/api/v1/users/${bob.user._id}/messaging`)).body.reason, "FRIENDS_ONLY");

  await befriend(ann, bob);

  assert.equal((await send(ann, bob, "Hi Bob")).status, 201);
  assert.equal((await ann.client.get("/api/v1/friends")).body.friends[0].fullName, "Bob Jones");
});

test("the chat list shows the newest message and what is unread", async () => {
  await send(bob, ann, "Hey Ann");
  await send(bob, ann, "Are you there?");

  const { chats, unreadCounts } = (await ann.client.get("/api/v1/messages/chats")).body;
  assert.equal(chats.length, 1);
  assert.equal(chats[0].fullName, "Bob Jones");
  assert.equal(chats[0].lastMessage.text, "Are you there?");
  assert.equal(unreadCounts[bob.user._id], 2);

  assert.equal((await ann.client.post(`/api/v1/messages/mark-read/${bob.user._id}`)).body.updated, 2);
  assert.equal((await ann.client.get("/api/v1/messages/chats")).body.unreadCounts[bob.user._id] ?? 0, 0);
  // Bob sees when Ann read them.
  const theirs = (await conversation(bob, ann)).body.messages.filter((m) => m.senderId === bob.user._id);
  assert.ok(theirs.every((m) => m.readAt));
});

test("read receipts stop both ways when either side turns them off", async () => {
  await ann.client.patch("/api/v1/users/settings", { privacy: { readReceipts: false } });

  const theirs = (await conversation(bob, ann)).body.messages.filter((m) => m.senderId === bob.user._id);
  assert.ok(theirs.every((m) => m.readAt === null), "Bob no longer learns when Ann read them");

  await ann.client.patch("/api/v1/users/settings", { privacy: { readReceipts: true } });
});

test("a long conversation loads newest first, a page at a time, without gaps or repeats", async () => {
  const { default: Message } = await import("../../src/models/message.model.js");
  const base = Date.parse("2026-01-01T10:00:00Z");
  // 80 older messages, ten of them saved in the same millisecond.
  await Message.insertMany(
    Array.from({ length: 80 }, (_, i) => ({
      senderId: i % 2 ? ann.user._id : bob.user._id,
      receiverId: i % 2 ? bob.user._id : ann.user._id,
      text: `old ${i}`,
      createdAt: new Date(i >= 30 && i < 40 ? base + 30_000 : base + i * 1000),
    }))
  );

  const seen = [];
  let query = "";
  let pages = 0;
  for (;;) {
    const page = (await conversation(ann, bob, query)).body;
    pages++;
    seen.unshift(...page.messages.map((m) => m.text));
    if (!page.hasMore) break;
    query = `?before=${encodeURIComponent(page.nextCursor)}`;
  }

  assert.equal(pages, 3);
  assert.equal(new Set(seen).size, seen.length, "no repeats");
  assert.equal(seen.length, 83);
  assert.deepEqual(seen.slice(-3), ["Hi Bob", "Hey Ann", "Are you there?"]);
  assert.equal(seen.filter((text) => text.startsWith("old ")).length, 80);

  assert.equal((await conversation(ann, bob, "?before=forged")).status, 400);
});

test("a message can be edited for a while and deleted for everyone or just for me", async () => {
  const { message } = (await send(ann, bob, "Typo here")).body;

  const edited = await ann.client.patch(`/api/v1/messages/item/${message._id}`, { text: "Fixed" });
  assert.equal(edited.body.message.text, "Fixed");
  assert.ok(edited.body.message.editedAt);
  assert.equal((await bob.client.patch(`/api/v1/messages/item/${message._id}`, { text: "Not yours" })).status >= 400, true);

  await ann.client.delete(`/api/v1/messages/item/${message._id}?for=everyone`);
  const forBob = (await conversation(bob, ann)).body.messages.find((m) => m._id === message._id);
  assert.ok(forBob.deletedAt);
  assert.equal(forBob.text, undefined);

  const { message: second } = (await send(bob, ann, "Only Ann hides this")).body;
  await ann.client.delete(`/api/v1/messages/item/${second._id}?for=me`);
  assert.equal((await conversation(ann, bob)).body.messages.some((m) => m._id === second._id), false);
  assert.equal((await conversation(bob, ann)).body.messages.some((m) => m._id === second._id), true);
});

test("deleting a chat clears it for me only, and only what came before", async () => {
  await ann.client.delete(`/api/v1/messages/chats/${bob.user._id}`);

  assert.deepEqual((await conversation(ann, bob)).body.messages, []);
  assert.deepEqual((await ann.client.get("/api/v1/messages/chats")).body.chats, []);
  assert.ok((await conversation(bob, ann)).body.messages.length > 0, "Bob keeps his copy");

  await send(bob, ann, "After the deletion");
  const after = (await conversation(ann, bob)).body.messages.map((m) => m.text);
  assert.deepEqual(after, ["After the deletion"]);
});

test("blocking stops messages and the friendship; unblocking doesn't bring it back", async () => {
  const blocked = await ann.client.post(`/api/v1/users/${bob.user._id}/block`);
  assert.equal(blocked.status, 200);

  assert.equal((await send(bob, ann, "Can you hear me?")).status, 403);
  assert.deepEqual((await bob.client.get("/api/v1/friends")).body.friends, []);
  assert.equal((await ann.client.get("/api/v1/users/blocked")).body.users[0].fullName, "Bob Jones");
  // Neither finds the other by name.
  assert.deepEqual((await bob.client.get("/api/v1/users/search?q=Ann")).body.users, []);

  await ann.client.delete(`/api/v1/users/${bob.user._id}/block`);
  assert.equal((await send(bob, ann, "Still not friends")).status, 403);
});
