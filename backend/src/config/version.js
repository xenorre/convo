import { readFileSync } from "node:fs";

// What is running, for /healthz and the X-App-Version header. The version
// comes from package.json, which the release script keeps in step with the
// frontend's (APP_VERSION can override it); a Docker build passes the git
// commit and build time (see the Dockerfile). In development those are null.
const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

export const BUILD = Object.freeze({
  version: process.env.APP_VERSION || version,
  commit: process.env.GIT_COMMIT || null,
  builtAt: process.env.BUILD_DATE || null,
});

// The API's own version, in every route: /api/v1/...
export const API_PREFIX = "/api/v1";
