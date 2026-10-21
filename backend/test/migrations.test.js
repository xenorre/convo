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

const { default: Migration } = await import("../src/models/migration.model.js");
const { default: logger } = await import("../src/config/logger.js");
const { runMigrations, STALE_CLAIM_MS } = await import("../src/migrations/runner.js");
const { MIGRATIONS } = await import("../src/migrations/index.js");
const { io } = await import("../src/config/socket.js");

logger.silent = true;
afterEach(() => mock.restoreAll());
after(() => io.close());

const now = new Date("2026-10-21T12:00:00Z");
const duplicate = () => Object.assign(new Error("E11000"), { code: 11000 });

const stubStore = ({ created = true, staleTakeover = false } = {}) => {
  const create = mock.method(Migration, "create", async () => { if (!created) throw duplicate(); });
  const takeover = mock.method(Migration, "findOneAndUpdate", async () => (staleTakeover ? {} : null));
  const update = mock.method(Migration, "updateOne", async () => ({}));
  const release = mock.method(Migration, "deleteOne", async () => ({}));
  return { create, takeover, update, release };
};

test("a pending migration runs once and is recorded as done", async () => {
  const store = stubStore();
  const run = mock.fn(async () => ({ created: 3 }));

  const results = await runMigrations([{ id: "m1", run }], { now: () => now });

  assert.equal(run.mock.callCount(), 1);
  assert.deepEqual(store.create.mock.calls[0].arguments[0], { _id: "m1", status: "running", startedAt: now });
  assert.deepEqual(store.update.mock.calls[0].arguments, [
    { _id: "m1" },
    { $set: { status: "done", finishedAt: now, result: { created: 3 } } },
  ]);
  assert.deepEqual(results, [{ id: "m1", status: "applied", result: { created: 3 } }]);
});

test("a migration that is done or running elsewhere is skipped", async () => {
  const store = stubStore({ created: false });
  const run = mock.fn();

  const results = await runMigrations([{ id: "m1", run }], { now: () => now });

  assert.equal(run.mock.callCount(), 0);
  assert.deepEqual(store.takeover.mock.calls[0].arguments[0], {
    _id: "m1",
    status: "running",
    startedAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) },
  });
  assert.deepEqual(results, [{ id: "m1", status: "skipped" }]);
});

test("a claim left by a crashed process is taken over", async () => {
  stubStore({ created: false, staleTakeover: true });
  const run = mock.fn(async () => {});

  const results = await runMigrations([{ id: "m1", run }], { now: () => now });

  assert.equal(run.mock.callCount(), 1);
  assert.equal(results[0].status, "applied");
});

test("a failed migration is released for the next start and does not throw", async () => {
  const store = stubStore();
  const second = mock.fn(async () => "ok");

  const results = await runMigrations([
    { id: "m1", run: async () => { throw new Error("db hiccup"); } },
    { id: "m2", run: second },
  ], { now: () => now });

  assert.deepEqual(store.release.mock.calls[0].arguments[0], { _id: "m1", status: "running" });
  assert.deepEqual(results.map((r) => r.status), ["failed", "applied"]);
  assert.equal(second.mock.callCount(), 1);
});

test("migration ids are unique", () => {
  const ids = MIGRATIONS.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
});
