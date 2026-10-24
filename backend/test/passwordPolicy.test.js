import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, beforeEach, mock, test } from "node:test";

// The password policy: length, personal words, strength and breaches. The
// breach service is always stubbed; tests never reach the network.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-session-secret";
process.env.REDIS_URL = "";
process.env.RESEND_API_KEY = "";
process.env.LOG_TO_FILES = "false";

const { default: User } = await import("../src/models/user.model.js");
const { default: logger } = await import("../src/config/logger.js");
const {
  PASSWORD_POLICY_ERRORS: E,
  isBreachedPassword,
  passwordPolicyError,
  passwordStrength,
  personalWords,
} = await import("../src/services/password.service.js");
const { signUp } = await import("../src/controllers/auth.controller.js");

logger.silent = true;

const strong = "violet-anchor-harbor-71";
const account = { fullName: "Dawid Zalewski", email: "dzalewski97@example.com" };
let requests;
let breachBody;
beforeEach(() => {
  requests = [];
  breachBody = "";
  mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(breachBody, { status: 200 });
  });
});
afterEach(() => mock.restoreAll());

const suffixOf = (password) =>
  crypto.createHash("sha1").update(password).digest("hex").toUpperCase().slice(5);

test("personal words are the name's parts and the email's local part, if long enough", () => {
  assert.deepEqual(personalWords(account), ["dawid", "zalewski", "dzalewski97"]);
  assert.deepEqual(personalWords({ fullName: "Al Li", email: "al@x.io" }), []);
});

test("length comes first, at least 12 and at most 128 characters", async () => {
  assert.equal(await passwordPolicyError("Xk9#vT2!qL", account), E.TOO_SHORT);
  assert.equal(await passwordPolicyError("a".repeat(129), account), E.TOO_LONG);
  assert.equal(requests.length, 0);
});

test("a password built on the user's name or email is refused", async () => {
  assert.equal(await passwordPolicyError("ZalewskiRocks!2024", account), E.PERSONAL);
  assert.equal(await passwordPolicyError("my-DZALEWSKI97-pass", account), E.PERSONAL);
});

test("common and patterned passwords are too weak, long phrases are fine", async () => {
  for (const weak of ["password1234", "qwertyuiop123", "aaaaaaaaaaaa", "123456789012"]) {
    assert.equal(await passwordPolicyError(weak, account), E.TOO_WEAK, weak);
  }
  assert.ok(passwordStrength(strong, account) >= 3);
  assert.equal(await passwordPolicyError(strong, account), null);
  // No composition rules: a long lowercase phrase is allowed.
  assert.equal(await passwordPolicyError("correct horse battery staple", account), null);
});

test("the breach check sends only the first five characters of the hash", async () => {
  breachBody = `0000000000000000000000000000000000A:0\r\n${suffixOf(strong)}:42\r\n`;

  assert.equal(await isBreachedPassword(strong), true);

  const [{ url, options }] = requests;
  const prefix = url.split("/").pop();
  assert.equal(prefix.length, 5);
  assert.ok(!url.includes(strong));
  assert.equal(options.headers["Add-Padding"], "true");
  assert.equal(await passwordPolicyError(strong, account), E.BREACHED);
});

test("padding entries with a zero count and other suffixes are not breaches", async () => {
  breachBody = `${suffixOf(strong)}:0\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:9\r\n`;
  assert.equal(await isBreachedPassword(strong), false);
});

test("an unreachable breach service doesn't block anyone", async () => {
  globalThis.fetch.mock.mockImplementation(async () => { throw new Error("offline"); });
  assert.equal(await passwordPolicyError(strong, account), null);

  globalThis.fetch.mock.mockImplementation(async () => new Response("", { status: 503 }));
  assert.equal(await passwordPolicyError(strong, account), null);
});

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
});

test("sign-up refuses a weak password with a message and the field to show it on", async () => {
  const lookup = mock.method(User, "findOne", () => assert.fail("must not create the account"));

  const res = response();
  await signUp({ body: { ...account, password: "Dawid123456789" }, requestId: "req" }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, E.PERSONAL);
  assert.equal(res.body.field, "password");
  assert.match(res.body.error, /name or email/);
  assert.equal(lookup.mock.callCount(), 0);
});

test("sign-up validates the name and email too", async () => {
  for (const body of [
    { fullName: "A", email: "a@example.com", password: strong },
    { fullName: "x".repeat(51), email: "a@example.com", password: strong },
    { fullName: "Ann Lee", email: "not-an-email", password: strong },
    { fullName: "Ann Lee", email: "a@example.com", password: "short" },
  ]) {
    const res = response();
    await signUp({ body, requestId: "req" }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
});
