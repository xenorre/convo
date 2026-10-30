import express from "express";
import path from "node:path";

// Vite fingerprints everything in assets/, so a new build gets new URLs.
export const serveImmutableAssets = (publicDir) => [
  express.static(path.join(publicDir, "assets"), {
    maxAge: "1y",
    immutable: true,
  }),
  (_req, res) => res.sendStatus(404),
];

export const servePublicFiles = (publicDir) => express.static(publicDir, {
  maxAge: "1h",
  setHeaders(res, filePath) {
    if (path.extname(filePath) === ".html") {
      res.setHeader("Cache-Control", "no-cache");
    }
  },
});

// Shown in the page; anything else is offered as a download.
const INLINE_FILES = /\.(jpg|png|webp|gif|mp4|webm)$/;

// Uploaded files have random names that never change, so they cache for good.
// They are served as inert files: helmet's nosniff keeps the type their name
// gives, and the sandbox policy stops anything in them from running as a
// page on this origin.
export const serveUploads = (uploadDir) => [
  express.static(uploadDir, {
    maxAge: "1y",
    immutable: true,
    index: false,
    setHeaders(res, filePath) {
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
      if (!INLINE_FILES.test(filePath)) res.setHeader("Content-Disposition", "attachment");
    },
  }),
  (_req, res) => res.sendStatus(404),
];
