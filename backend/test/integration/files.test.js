import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import { befriend, createUser, PASSWORD, startApp } from "./harness.js";

// Photos kept on the server's own disk, end to end: uploading, showing,
// replacing and removing them, over HTTP against a real MongoDB.
let app;
let ann;
let bob;
before(async () => {
  app = await startApp();
  ann = await createUser(app, { fullName: "Ann Smith", email: "ann@example.com" });
  bob = await createUser(app, { fullName: "Bob Jones", email: "bob@example.com" });
  await befriend(ann, bob);
});
after(() => app?.stop());

const image = (field, name = "photo.png", type = "image/png", fields = {}, bytes = Buffer.from("\x89PNG fake image")) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append(field, new Blob([bytes], { type }), name);
  return form;
};
const filesOnDisk = () => readdir(app.uploadDir, { recursive: true, withFileTypes: true }).then((entries) => entries.filter((entry) => entry.isFile()).length);
const onDisk = (fileUrl) => existsSync(path.join(app.uploadDir, fileUrl.replace(/^\/uploads\//, "")));

test("a new profile photo is stored, shown to anyone with the link and replaces the old one", async () => {
  const first = (await ann.client.put("/api/v1/users/update-profile-image", image("profileImage"))).body.user.profilePic;
  assert.match(first, new RegExp(`^/uploads/profile-images/${ann.user._id}/[0-9a-f-]{36}\\.png$`));

  const shown = await fetch(`${app.base}${first}`);
  assert.equal(shown.status, 200);
  assert.equal(shown.headers.get("content-type"), "image/png");
  assert.equal(shown.headers.get("x-content-type-options"), "nosniff");
  // Static files don't need the CSRF cookie.
  assert.equal(shown.headers.getSetCookie().length, 0);

  const second = (await ann.client.put("/api/v1/users/update-profile-image", image("profileImage"))).body.user.profilePic;
  assert.notEqual(second, first);
  assert.equal(onDisk(first), false, "the old photo is removed");

  await ann.client.delete("/api/v1/users/profile-image");
  assert.equal(onDisk(second), false);
});

test("only images are accepted as a profile photo", async () => {
  const refused = await ann.client.put("/api/v1/users/update-profile-image", image("profileImage", "page.html", "text/html"));
  assert.equal(refused.status, 400);
});

test("files over 2 MB are refused before anything is stored", async () => {
  const before = await filesOnDisk();
  const big = Buffer.alloc(2 * 1024 * 1024 + 1);

  const photo = await ann.client.put("/api/v1/users/update-profile-image", image("profileImage", "big.png", "image/png", {}, big));
  assert.equal(photo.status, 400);
  assert.equal(photo.body.message, "The file must be 2 MB or smaller");

  const message = await ann.client.post(`/api/v1/messages/send/${bob.user._id}`, image("messageFile", "big.jpg", "image/jpeg", { text: "Big" }, big));
  assert.equal(message.status, 400);
  assert.equal(message.body.message, "The file must be 2 MB or smaller");

  assert.equal(await filesOnDisk(), before);
});

test("a photo in a message is kept until it is deleted for everyone", async () => {
  const sent = await ann.client.post(`/api/v1/messages/send/${bob.user._id}`, image("messageFile", "beach.jpg", "image/jpeg", { text: "Look" }));
  assert.equal(sent.status, 201);
  const { _id, image: fileUrl } = sent.body.message;
  assert.match(fileUrl, /^\/uploads\/message-files\/.+\.jpg$/);
  assert.equal((await fetch(`${app.base}${fileUrl}`)).status, 200);

  await ann.client.delete(`/api/v1/messages/item/${_id}?for=everyone`);
  assert.equal(onDisk(fileUrl), false);
  assert.equal((await fetch(`${app.base}${fileUrl}`)).status, 404);
});

test("the export links to files with full addresses, and deleting the account removes them", async () => {
  const sent = await bob.client.post(`/api/v1/messages/send/${ann.user._id}`, image("messageFile"));
  const fileUrl = sent.body.message.image;

  const exported = (await bob.client.get("/api/v1/users/me/export")).body;
  assert.equal(exported.messages.find((m) => m.attachment).attachment, `http://convo.test${fileUrl}`);

  assert.equal((await bob.client.delete("/api/v1/users/me", { password: PASSWORD })).status, 200);
  assert.equal(onDisk(fileUrl), false);
});
