import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";

// These tests stub every database and storage call and never use a
// developer's DB, Redis, credentials, storage bucket or email configuration.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";

const { default: User } = await import("../src/models/user.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { s3Storage } = await import("../src/config/storage.js");
const { DEFAULT_PROFILE_PIC, isDefaultProfileImage } = await import("../src/services/user.service.js");
const { removeProfileImage } = await import("../src/controllers/user.controller.js");
const { updateProfileSchema } = await import("../src/validations/user.validation.js");
const { io } = await import("../src/config/socket.js");

logger.silent = true;
afterEach(() => mock.restoreAll());
after(() => io.close());

const userId = "507f1f77bcf86cd799439011";
const storedPic = "https://project.supabase.co/storage/v1/object/public/bucket/profile-images/u/a.png";

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
});

const stubUser = (profilePic) => {
  mock.method(User, "findById", (id) => {
    assert.equal(id, userId);
    return Promise.resolve(profilePic === undefined ? null : { _id: userId, profilePic });
  });
  return mock.method(User, "findByIdAndUpdate", (id, update) => ({
    select(selection) {
      assert.equal(selection, "-password");
      return Promise.resolve({ _id: id, fullName: "Ada", ...update });
    },
  }));
};

const remove = async () => {
  const res = response();
  await removeProfileImage({ user: { id: userId } }, res);
  return res;
};

test("removing a stored photo restores the default avatar and deletes the file", async () => {
  const update = stubUser(storedPic);
  const send = mock.method(s3Storage, "send", () => Promise.resolve({}));

  const res = await remove();

  assert.equal(res.statusCode, 200);
  assert.deepEqual(update.mock.calls[0].arguments[1], { profilePic: DEFAULT_PROFILE_PIC });
  assert.equal(res.body.user.profilePic, DEFAULT_PROFILE_PIC);
  assert.equal(send.mock.callCount(), 1);
  assert.equal(send.mock.calls[0].arguments[0].input.Key, "profile-images/u/a.png");
});

test("removing the default avatar never touches storage", async () => {
  stubUser(DEFAULT_PROFILE_PIC);
  const send = mock.method(s3Storage, "send", () => assert.fail("must not call storage"));

  const res = await remove();

  assert.equal(res.statusCode, 200);
  assert.equal(send.mock.callCount(), 0);
});

test("a storage failure does not undo the profile change", async () => {
  stubUser(storedPic);
  mock.method(s3Storage, "send", () => Promise.reject(new Error("bucket down")));

  const res = await remove();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.profilePic, DEFAULT_PROFILE_PIC);
});

test("removing a photo for a missing user returns 404", async () => {
  stubUser(undefined);

  const res = await remove();

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "User not found" });
});

test("default avatar detection matches the schema default", () => {
  assert.ok(isDefaultProfileImage(DEFAULT_PROFILE_PIC));
  assert.ok(isDefaultProfileImage(""));
  assert.ok(!isDefaultProfileImage(storedPic));
});

test("profile names are trimmed before the length rules apply", () => {
  assert.deepEqual(updateProfileSchema.parse({ fullName: "  Ada Lovelace  " }), { fullName: "Ada Lovelace" });
  assert.equal(updateProfileSchema.safeParse({ fullName: "  A  " }).success, false);
  assert.equal(updateProfileSchema.safeParse({ fullName: "x".repeat(51) }).success, false);
  assert.equal(updateProfileSchema.safeParse({ email: "a@b.c" }).success, false);
});
