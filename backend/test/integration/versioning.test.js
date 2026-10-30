import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startApp } from "./harness.js";

// Which build is running and which API version is served, as a deployed
// server reports them.
process.env.APP_VERSION = "1.4.2";
process.env.GIT_COMMIT = "abc1234";
process.env.BUILD_DATE = "2026-10-30T12:00:00Z";

let app;
before(async () => {
  app = await startApp();
});
after(() => app?.stop());

test("/healthz says which build is running", async () => {
  const health = await (await fetch(`${app.base}/healthz`)).json();
  assert.deepEqual(health, { status: "ok", version: "1.4.2", commit: "abc1234", builtAt: "2026-10-30T12:00:00Z" });
});

test("every answer names the version, and a browser on another origin may read it", async () => {
  const response = await fetch(`${app.base}/api/v1/auth/check`, { headers: { origin: "http://convo.test" } });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("x-app-version"), "1.4.2");
  assert.equal(response.headers.get("x-app-commit"), "abc1234");
  const exposed = response.headers.get("access-control-expose-headers").toLowerCase();
  assert.ok(exposed.includes("x-app-version") && exposed.includes("x-app-commit"));
});

test("the API lives under /api/v1 only", async () => {
  assert.equal((await fetch(`${app.base}/api/v1/auth/check`)).status, 401);
  assert.equal((await fetch(`${app.base}/api/auth/check`)).status, 404);
});
