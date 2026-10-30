import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

// Files kept on the server's own disk: how they are named, stored, removed
// and served. Everything happens in a throwaway folder.
const uploadDir = await mkdtemp(path.join(tmpdir(), "convo-uploads-test-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/convo_unit_tests";
process.env.JWT_SECRET = "test-only-storage-secret";
process.env.LOG_TO_FILES = "false";
process.env.CLIENT_URL = "https://convo.test";
process.env.STORAGE_DRIVER = "local";
process.env.UPLOAD_DIR = uploadDir;

const { default: logger } = await import("../src/config/logger.js");
const { absoluteFileUrl, deleteFile, MAX_UPLOAD_BYTES, STORAGE_DRIVER, uploadFile, uploadProfileImage } = await import(
  "../src/services/storage.service.js"
);
const { serveUploads } = await import("../src/middleware/static.middleware.js");

logger.silent = true;

let server;
let baseUrl;
before(async () => {
  const app = express();
  app.use("/uploads", serveUploads(uploadDir));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server?.close();
  await rm(uploadDir, { recursive: true, force: true });
});

const onDisk = (fileUrl) => path.join(uploadDir, fileUrl.replace(/^\/uploads\//, ""));

test("the chosen driver is used", () => {
  assert.equal(STORAGE_DRIVER, "local");
});

test("a file is saved under a random name and stored by path only", async () => {
  const fileUrl = await uploadProfileImage(Buffer.from("png bytes"), "me.png", "image/png", "user1");

  assert.match(fileUrl, /^\/uploads\/profile-images\/user1\/[0-9a-f-]{36}\.png$/);
  assert.equal(await readFile(onDisk(fileUrl), "utf8"), "png bytes");
  // Nothing half-written is left next to it.
  assert.deepEqual((await readdir(path.dirname(onDisk(fileUrl)))).filter((name) => name.endsWith(".partial")), []);
});

test("the type decides the extension, not the uploaded name", async () => {
  const fileUrl = await uploadFile(Buffer.from("<script>alert(1)</script>"), "evil.html", "image/png");
  assert.match(fileUrl, /\.png$/);

  await assert.rejects(uploadFile(Buffer.from("x"), "page.html", "text/html"), /Failed to upload file/);
});

test("nothing larger than 2 MB is stored", async () => {
  assert.equal(MAX_UPLOAD_BYTES, 2 * 1024 * 1024);
  await assert.rejects(uploadFile(Buffer.alloc(MAX_UPLOAD_BYTES + 1), "big.png", "image/png", "big"), /Failed to upload file/);
  assert.equal(existsSync(path.join(uploadDir, "big")), false);

  assert.match(await uploadFile(Buffer.alloc(MAX_UPLOAD_BYTES), "max.png", "image/png"), /\.png$/);
});

test("deleting removes the file, and a missing file counts as deleted", async () => {
  const fileUrl = await uploadFile(Buffer.from("bytes"), "a.jpg", "image/jpeg");
  assert.equal(await deleteFile(fileUrl), true);
  assert.equal(existsSync(onDisk(fileUrl)), false);
  assert.equal(await deleteFile(fileUrl), true);
});

test("a path can't reach outside the upload folder", async () => {
  await assert.rejects(deleteFile("/uploads/../../etc/hosts"), /Failed to delete file/);
  await assert.rejects(uploadFile(Buffer.from("x"), "a.png", "image/png", "../outside"), /Failed to upload file/);
});

test("images are shown in place, cached for good and can't run anything", async () => {
  const fileUrl = await uploadFile(Buffer.from("png bytes"), "a.png", "image/png", "message-files/a/b");
  const response = await fetch(`${baseUrl}${fileUrl}`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.match(response.headers.get("cache-control"), /max-age=31536000.*immutable/);
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'.*sandbox/);
  assert.equal(response.headers.get("content-disposition"), null);
});

test("other files are offered as a download", async () => {
  const fileUrl = await uploadFile(Buffer.from("%PDF-1.7"), "notes.pdf", "application/pdf");
  const response = await fetch(`${baseUrl}${fileUrl}`);

  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("content-disposition"), "attachment");
});

test("a missing file or a folder is a plain 404", async () => {
  assert.equal((await fetch(`${baseUrl}/uploads/nope.png`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/uploads/message-files/`)).status, 404);
});

test("exports get full addresses for files on this server", () => {
  assert.equal(absoluteFileUrl("/uploads/a/b.png"), "https://convo.test/uploads/a/b.png");
  assert.equal(absoluteFileUrl("https://cdn.test/x.png"), "https://cdn.test/x.png");
  assert.equal(absoluteFileUrl(undefined), undefined);
});
