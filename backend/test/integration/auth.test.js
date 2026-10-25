import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createUser, PASSWORD, startApp } from "./harness.js";

// Accounts end to end: sign-up, confirmation, sessions, password reset,
// password change and email change, over HTTP against a real MongoDB.
let app;
before(async () => {
  app = await startApp();
});
after(() => app?.stop());

const login = (client, email, password = PASSWORD) => client.post("/api/auth/login", { email, password });

test("a new account signs in only after its email is confirmed", async () => {
  const client = app.client();
  const signUp = await client.post("/api/auth/sign-up", { fullName: "Ann Smith", email: "Ann@Example.com", password: PASSWORD });
  assert.equal(signUp.status, 201);
  assert.equal(signUp.body.email, "ann@example.com");
  assert.equal(client.hasSession(), false);

  const early = await login(client, "ann@example.com");
  assert.equal(early.status, 403);
  assert.equal(early.body.code, "EMAIL_NOT_VERIFIED");

  const { token } = app.lastEmailTo("ann@example.com");
  const confirm = await client.post("/api/auth/verify-email", { token });
  assert.equal(confirm.status, 200);
  assert.equal(client.hasSession(), true);
  assert.equal((await client.get("/api/auth/check")).body.email, "ann@example.com");

  // A link works once.
  assert.equal((await app.client().post("/api/auth/verify-email", { token })).status, 400);
  // The same address can't sign up twice.
  const again = await app.client().post("/api/auth/sign-up", { fullName: "Ann Again", email: "ann@example.com", password: PASSWORD });
  assert.equal(again.status >= 400, true);
});

test("signing in elsewhere ends the earlier session; signing out ends this one", async () => {
  const bob = await createUser(app, { fullName: "Bob Jones", email: "bob@example.com" });
  const laptop = bob.client;
  const phone = app.client();

  assert.equal((await login(phone, "bob@example.com")).status, 200);
  const revoked = await laptop.get("/api/auth/check");
  assert.equal(revoked.status, 401);
  assert.equal(revoked.body.code, "SESSION_REVOKED");

  assert.equal((await phone.post("/api/auth/logout")).status, 200);
  assert.equal(phone.hasSession(), false);
  assert.equal((await phone.get("/api/auth/check")).status, 401);
  assert.equal((await login(phone, "bob@example.com", "wrong-password-123")).status, 401);
});

test("a forgotten password is reset from the emailed link", async () => {
  const cyd = await createUser(app, { fullName: "Cyrus Lee", email: "cyrus@example.com" });
  const stranger = app.client();

  // The same answer for an address without an account.
  const unknown = await stranger.post("/api/auth/forgot-password", { email: "nobody@example.com" });
  const known = await stranger.post("/api/auth/forgot-password", { email: "cyrus@example.com" });
  assert.deepEqual([unknown.status, unknown.body.message], [known.status, known.body.message]);
  assert.equal(app.emails.some((email) => email.to === "nobody@example.com"), false);

  const { token } = app.lastEmailTo("cyrus@example.com");
  const check = await stranger.post("/api/auth/reset-password/check", { token });
  assert.equal(check.body.email, "cyrus@example.com");

  // Refused passwords leave the link usable.
  const weak = await stranger.post("/api/auth/reset-password", { token, password: "cyrus-lantern-forever-26" });
  assert.equal(weak.body.code, "PASSWORD_PERSONAL");

  const reset = await stranger.post("/api/auth/reset-password", { token, password: "violet-anchor-harbor-71" });
  assert.equal(reset.status, 200);
  assert.equal(stranger.hasSession(), true);
  // The old session is signed out; the old password no longer works.
  assert.equal((await cyd.client.get("/api/auth/check")).status, 401);
  assert.equal((await login(app.client(), "cyrus@example.com")).status, 401);
  assert.equal((await login(app.client(), "cyrus@example.com", "violet-anchor-harbor-71")).status, 200);
  assert.match(app.lastEmailTo("cyrus@example.com").subject, /password was changed/);

  assert.equal((await stranger.post("/api/auth/reset-password", { token, password: "another-strong-pass-77" })).status, 400);
});

test("changing the password keeps this browser signed in on a new session", async () => {
  const dee = await createUser(app, { fullName: "Dee Park", email: "dee@example.com" });

  const wrong = await dee.client.put("/api/auth/password", { currentPassword: "nope", newPassword: "violet-anchor-harbor-71" });
  assert.equal(wrong.body.code, "INVALID_CURRENT_PASSWORD");

  const changed = await dee.client.put("/api/auth/password", { currentPassword: PASSWORD, newPassword: "violet-anchor-harbor-71" });
  assert.equal(changed.status, 200);
  assert.equal((await dee.client.get("/api/auth/check")).status, 200);
  assert.equal((await login(app.client(), "dee@example.com", "violet-anchor-harbor-71")).status, 200);
});

test("the sign-in email changes only after the link sent to the new address", async () => {
  const eve = await createUser(app, { fullName: "Eve Stone", email: "eve@example.com" });

  const taken = await eve.client.post("/api/users/me/email", { newEmail: "bob@example.com", password: PASSWORD });
  assert.equal(taken.status, 409);

  const requested = await eve.client.post("/api/users/me/email", { newEmail: "eve.new@example.com", password: PASSWORD });
  assert.equal(requested.status, 200);
  assert.equal((await eve.client.get("/api/users/me/email")).body.pending.email, "eve.new@example.com");
  assert.match(app.lastEmailTo("eve@example.com").subject, /new email was requested/);
  assert.equal((await login(app.client(), "eve@example.com")).status, 200);

  // Opened on another device, signed out.
  const confirmed = await app.client().post("/api/auth/confirm-email-change", { token: app.lastEmailTo("eve.new@example.com").token });
  assert.equal(confirmed.body.email, "eve.new@example.com");
  assert.equal((await login(app.client(), "eve@example.com")).status, 401);
  assert.equal((await login(app.client(), "eve.new@example.com")).status, 200);
  assert.match(app.lastEmailTo("eve@example.com").subject, /email was changed/);
});

test("migrations run once on a fresh database and are skipped after", async () => {
  const { runMigrations } = await import("../../src/migrations/runner.js");
  const { default: User } = await import("../../src/models/user.model.js");
  // An account from before email confirmation existed.
  await User.collection.insertOne({ fullName: "Old Timer", email: "old@example.com", password: "x", createdAt: new Date() });

  await runMigrations();
  await runMigrations();

  const old = await User.findOne({ email: "old@example.com" }).lean();
  assert.ok(old.emailVerifiedAt instanceof Date, "old accounts keep signing in");
  const records = await app.mongoose.connection.db.collection("migrations").find().toArray();
  assert.ok(records.length > 0 && records.every((record) => record.status === "done"));
});
