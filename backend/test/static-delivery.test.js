import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import {
  serveImmutableAssets,
  servePublicFiles,
} from "../src/middleware/static.middleware.js";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-static-secret";
const { ensureCsrfTokenCookie, csrfProtection } = await import(
  "../src/middleware/csrf.middleware.js"
);

let publicDir;
let server;
let baseUrl;

before(async () => {
  publicDir = await mkdtemp(path.join(tmpdir(), "convo-static-test-"));
  await mkdir(path.join(publicDir, "assets"));
  await writeFile(path.join(publicDir, "assets/app-AbCd1234.js"), "export const app = true;");
  await writeFile(path.join(publicDir, "index.html"), "<!doctype html><title>Convo</title>");
  await writeFile(path.join(publicDir, "favicon.svg"), '<svg xmlns="http://www.w3.org/2000/svg" />');

  const app = express();
  app.use(cookieParser());
  app.use("/assets", serveImmutableAssets(publicDir));
  app.use(ensureCsrfTokenCookie);
  app.use(csrfProtection);
  app.post("/api/action", (_req, res) => res.sendStatus(204));
  app.use(servePublicFiles(publicDir));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (publicDir) await rm(publicDir, { recursive: true, force: true });
});

test("fingerprinted assets have a one-year immutable cache and no CSRF cookie", async () => {
  const response = await fetch(`${baseUrl}/assets/app-AbCd1234.js`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.match(response.headers.get("content-type"), /javascript/);
  assert.equal(await response.text(), "export const app = true;");
});

test("missing build assets return 404 instead of the HTML app", async () => {
  const response = await fetch(`${baseUrl}/assets/missing.js`);

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.doesNotMatch(response.headers.get("cache-control") || "", /immutable/);
  assert.doesNotMatch(await response.text(), /<title>Convo/);
});

test("HTML revalidates while non-fingerprinted public files use a short cache", async () => {
  const html = await fetch(`${baseUrl}/index.html`);
  assert.equal(html.headers.get("cache-control"), "no-cache");
  assert.match(html.headers.get("set-cookie"), /csrfToken/);
  await html.text();

  const icon = await fetch(`${baseUrl}/favicon.svg`);
  assert.equal(icon.headers.get("cache-control"), "public, max-age=3600");
  await icon.text();
});

test("API mutations still require a matching CSRF cookie and header", async () => {
  const blocked = await fetch(`${baseUrl}/api/action`, { method: "POST" });
  assert.equal(blocked.status, 403);
  await blocked.text();

  const allowed = await fetch(`${baseUrl}/api/action`, {
    method: "POST",
    headers: { Cookie: "csrfToken=test-token", "x-csrf-token": "test-token" },
  });
  assert.equal(allowed.status, 204);
});
