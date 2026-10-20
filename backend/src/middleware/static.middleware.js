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
