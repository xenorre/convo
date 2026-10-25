import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { befriend, createUser, PASSWORD, startApp } from "./harness.js";

// Exporting and deleting an account end to end, over HTTP against a real
// MongoDB, and what the people it talked to see afterwards.
let app;
let ann;
let bob;
before(async () => {
  app = await startApp();
  ann = await createUser(app, { fullName: "Ann Smith", email: "ann@example.com" });
  bob = await createUser(app, { fullName: "Bob Jones", email: "bob@example.com" });
  await befriend(ann, bob);
  await ann.client.post(`/api/messages/send/${bob.user._id}`, { text: "Hi Bob" });
  await bob.client.post(`/api/messages/send/${ann.user._id}`, { text: "Hi Ann" });
  await ann.client.put(`/api/messages/chats/${bob.user._id}/mute`, { duration: "forever" });
});
after(() => app?.stop());

test("the export holds the account, its friends, settings and every message, and no secrets", async () => {
  const exported = await ann.client.get("/api/users/me/export");

  assert.equal(exported.status, 200);
  const data = exported.body;
  assert.equal(data.account.email, "ann@example.com");
  assert.deepEqual(data.friends.map((friend) => friend.user.fullName), ["Bob Jones"]);
  assert.equal(data.conversationSettings.muted.length, 1);
  assert.deepEqual(data.messages.map((m) => [m.direction, m.text]), [["sent", "Hi Bob"], ["received", "Hi Ann"]]);
  assert.ok(!/password|activeSessionId|tokenHash/.test(JSON.stringify(data)));
});

test("deleting needs the password, then removes the account at once", async () => {
  const wrong = await ann.client.delete("/api/users/me", { password: "guess" });
  assert.equal(wrong.body.code, "ACCOUNT_INVALID_PASSWORD");
  assert.equal((await ann.client.get("/api/auth/check")).status, 200);

  const deleted = await ann.client.delete("/api/users/me", { password: PASSWORD });
  assert.equal(deleted.status, 200);
  assert.equal(ann.client.hasSession(), false);
  assert.match(app.lastEmailTo("ann@example.com").subject, /account was deleted/);

  // Nothing signs in to it any more.
  const login = await app.client().post("/api/auth/login", { email: "ann@example.com", password: PASSWORD });
  assert.equal(login.status, 401);
});

test("people it talked to keep the conversation, shown as from \"Deleted account\"", async () => {
  const { chats } = (await bob.client.get("/api/messages/chats")).body;
  assert.equal(chats.length, 1);
  assert.deepEqual([chats[0].fullName, chats[0].deleted], ["Deleted account", true]);

  const texts = (await bob.client.get(`/api/messages/${ann.user._id}`)).body.messages.map((m) => m.text);
  assert.deepEqual(texts, ["Hi Bob", "Hi Ann"]);

  const messaging = await bob.client.get(`/api/users/${ann.user._id}/messaging`);
  assert.equal(messaging.body.reason, "ACCOUNT_DELETED");
  assert.equal((await bob.client.post(`/api/messages/send/${ann.user._id}`, { text: "Hello?" })).status, 403);
  assert.deepEqual((await bob.client.get("/api/friends")).body.friends, []);
  assert.deepEqual((await bob.client.get("/api/users/search?q=Ann")).body.users, []);
  assert.deepEqual((await bob.client.get("/api/users/search?q=Deleted")).body.users, []);
});

test("what is left in the database is an empty shell, and the address is free again", async () => {
  const { default: User } = await import("../../src/models/user.model.js");
  const shell = await User.findById(ann.user._id).select("+activeSessionId").lean();
  assert.equal(shell.fullName, "Deleted account");
  assert.match(shell.email, /@deleted\.invalid$/);
  assert.equal(shell.privacy, undefined);
  assert.equal(shell.activeSessionId, undefined);
  const collections = app.mongoose.connection.db;
  for (const [name, filter] of [
    ["friendships", { $or: [{ requester: shell._id }, { recipient: shell._id }] }],
    ["chatmutes", { userId: shell._id }],
  ]) {
    assert.equal(await collections.collection(name).countDocuments(filter), 0, name);
  }

  const again = await createUser(app, { fullName: "Ann Again", email: "ann@example.com" });
  assert.notEqual(again.user._id, ann.user._id);
});
