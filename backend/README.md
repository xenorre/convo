# ConvoChat Backend

Production-ready Node.js/Express API with MongoDB and Socket.IO for real-time messaging. Includes CSRF protection, JWT auth (httpOnly cookie), CORS hardening, request tracing, Docker/Compose, optional Redis scaling, S3-compatible storage, and deployment scripts.

## Features

- Express 5 API with structured middleware and route modules
- Real-time messaging via Socket.IO (rooms: user:<id>)
- JWT auth in httpOnly cookie; protected routes middleware
- One active login session per account, with immediate sign-out of replaced devices
- CSRF protection for unsafe methods (x-csrf-token + cookie)
- CORS with environment-based allowlists and strict security headers
- Request ID propagation and structured logging (winston + morgan)
- MongoDB (Mongoose) models for users and messages
- File uploads for messages/profile images, kept on the server's disk (served under /uploads) or in an S3-compatible bucket
- Optional Redis adapter for Socket.IO scaling and presence tracking
- Dockerfiles and Compose for dev, fullstack, and production
- CI workflow for Node and Docker builds

## Tech Stack

- Node 24, Express 5, Mongoose, Socket.IO
- JWT, bcrypt, cookie-parser, helmet, cors
- Winston + morgan for logging
- Zod for environment validation
- AWS SDK (S3-compatible) for storage
- Redis (optional) for Socket.IO adapter and presence

## Quick Start

Choose one of the options below.

Option A: Local development

```bash
npm ci
cp .env.example .env
npm run dev
# API: http://localhost:3000
```

Option B: Dev with Docker (backend + Mongo + Redis)

```bash
docker-compose up -d
# API: http://localhost:3000
```

Option C: Full stack (backend + frontend) via Compose

```bash
docker-compose -f docker-compose.fullstack.yml up -d
# Backend: http://localhost:3000
# Frontend: http://localhost:3001
```

Option D: Helper scripts

```bash
./scripts/quickstart.sh      # interactive quick start
./scripts/dev.sh             # dev server (see --help)
./scripts/test.sh            # QA script (lint/tests/coverage if configured)
./scripts/deploy.sh --help   # deploy/build script
```

## Environment

Copy .env.example to .env and fill values. Key variables:

- Server
  - PORT (default 3000)
  - NODE_ENV (development|test|production)
  - LOG_LEVEL (info|debug|warn|error)
  - COOKIE_MAX_AGE_MS (e.g., 900000)
- Database / Cache
  - DATABASE_URL (MongoDB connection string)
  - REDIS_URL (optional, enables Socket.IO Redis adapter + presence)
- Auth
  - JWT_SECRET, JWT_EXPIRES_IN
- CORS/Client
  - CLIENT_URL (single or comma-separated origins)
  - PREVIEW_URL (optional)
- Email (Resend)
  - RESEND_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME
- Storage
  - STORAGE_DRIVER: `local` (files on disk, served by the app under /uploads) or `s3`; empty means s3 when STORAGE_URL is set, local otherwise
  - UPLOAD_DIR: where `local` keeps files (default backend/uploads; mount a volume there in Docker)
  - For `s3`: STORAGE_URL, STORAGE_PUBLIC_URL, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, STORAGE_BUCKET_NAME
- Arcjet (optional)
  - ARCJET_KEY

The app performs environment validation at startup (zod). In production, CLIENT_URL is required.

## Scripts

package.json scripts (selected):

- npm run dev — node --watch src/index.js
- npm start — node src/index.js
- npm test — unit tests, then integration tests
- npm run test:unit — Node built-in tests with the database stubbed; no external services
- npm run test:integration — the real app over HTTP against a throwaway MongoDB (mongodb-memory-server, same version as the Docker images). The first run downloads the MongoDB binary (about 70 MB) into ~/.cache
- npm run docker:build / docker:run / docker:stop
- npm run compose:up|down|logs
- npm run fullstack:up|down|logs
- npm run production:up|down|logs
- npm run health — GET /healthz check
- npm run migrate — apply pending data migrations now (see Data migrations)

Helper scripts (scripts/):

- dev.sh — local or Docker dev; optional frontend start
- quickstart.sh — assisted setup
- test.sh — lint/tests/coverage/security (runs what’s available)
- deploy.sh — build/tag/push and local deploy via compose.production

Note: lint scripts remain placeholders; all backend tests run with `npm test`.

## API Overview

Base URL: http://localhost:3000

Health and CSRF

- GET /healthz — liveness, plus the running build: { status, version, commit, builtAt }
- GET /readyz — readiness (Mongo connected)
- GET /csrf-token — returns { csrfToken }, used to set x-csrf-token header

Every API route is versioned under /api/v1, and every answer carries X-App-Version (and X-App-Commit in Docker builds), which the frontend uses to offer a reload after a deploy.

Auth (/api/v1/auth)

- POST /sign-up — { fullName, email, password }
- POST /login — { email, password }
- POST /logout — ends the current session and clears its auth cookie
- GET /check — returns current user (requires auth)

Users (/api/v1/users)

- GET /profile — current user
- PUT /update-profile — update profile fields
- PUT /update-profile-image — multipart/form-data field profileImage

Messages (/api/v1/messages)

- GET /contacts — list of users (excluding self)
- GET /chats — chat partners derived from message history
- GET /:id — messages with a specific user
- POST /send/:id — send message
  - JSON: { text?: string }
  - multipart/form-data: messageFile optional (image/pdf/doc/video), text optional

Real-time (Socket.IO)

- Auth: server reads JWT from httpOnly cookie token on handshake
- Rooms: server joins user to room user:<id>
- Online Users: server emits getOnlineUsers with [userId]
- New Message: server emits newMessage with payload { message }
- Replaced session: server emits `session:revoked` with `{ code: "SESSION_REVOKED", message }`, then disconnects that session's sockets

## Data migrations

Data migrations live in `src/migrations/index.js` and run automatically: every
server start applies the ones this database has not seen, in the background
after the server starts listening, so no deploy platform needs an extra step.
The `migrations` collection records each one; with several instances only one
claims a migration and the others skip it. A failed migration is logged, the
app keeps running, and the next start retries it. Run `npm run migrate` to
apply them immediately (it exits non-zero if one fails).

- `2026-10-friends-from-chat-partners` — everyone who already exchanged a
  message becomes friends, so nobody loses their conversations when the
  friends list replaces the contacts list.

## Login sessions

Every successful signup or login creates a fresh random session ID. Its JWT
contains `sid`, and MongoDB stores the account's current ID in the hidden
`activeSessionId` field. A newer login replaces that value atomically, so older
tokens immediately fail protected HTTP requests and Socket.IO handshakes.
Multiple tabs sharing the same cookie belong to the same session and remain
connected together. An explicit new login also replaces an existing session in
the same browser.

For a replaced or legacy token, HTTP returns `401` with
`{ code: "SESSION_REVOKED", error: "You have been signed out because your account was signed in on another device." }`.
Socket.IO handshake errors put the same code and a `message` in `error.data`.
Clients should clear their local authenticated state and show that message,
without calling logout. Logout itself uses a conditional database update, so a
delayed logout from an older token cannot invalidate a newer session or remove
its browser cookie. Session IDs are excluded from user API responses.

Existing tokens issued before this change have no `sid` and require one new
login. Existing account documents need no migration; the next successful login
creates their current session ID.

Socket.IO connection-state recovery is disabled because it restores rooms and
replays missed packets before authentication middleware. On reconnect, the
frontend reloads conversations and messages through authenticated HTTP. If
`REDIS_URL` is configured, the server initializes the Redis adapter and presence
before accepting connections; all instances must share that Redis service for
immediate cross-instance session revocation.

Minimal client connect example (fetch CSRF then send):

```js
// Pseudo-example
fetch('/csrf-token', { credentials: 'include' })
  .then(res => res.json())
  .then(({ csrfToken }) => fetch('/api/v1/messages/send/<userId>', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
    credentials: 'include',
    body: JSON.stringify({ text: 'Hello' })
  }));
```

Security

- CSRF: ensure x-csrf-token header matches csrfToken cookie for POST/PUT/PATCH/DELETE
- CORS: strict allowlist via src/config/cors.config.js (multiple origins supported via comma)
- Helmet: hardened security headers including CSP (env-aware)
- Auth: JWT in httpOnly cookie; protectRoute checks and injects req.user
- Rate limiting/bot detection: Arcjet rules enabled if ARCJET_KEY present
- Request tracing: x-request-id header echoed; logs include requestId

Project Structure

- src/index.js — process bootstrap
- src/server.js — DB connect, graceful shutdown, HTTP server start
- src/app.js — Express app, middlewares, routes, health, CSRF
- src/config — env, db, socket, cors/logger/storage/email providers
- src/middleware — auth, csrf, upload (profile/message), requestId, security, errors
- src/models — user, message (mongoose)
- src/controllers — auth, user, message
- src/routes — route modules (auth/users/messages)
- src/services — auth/user/storage/email
- src/utils — cookies/jwt/format/email templates

Docker & Compose

- Dockerfile — multi-stage image; production runner with tini + healthcheck
- docker-compose.yml — dev stack (backend + Mongo + Redis)
- docker-compose.fullstack.yml — adds frontend and admin UIs (mongo-express, redis-commander)
- Production runs from the root image and docker-compose.prod.yaml; see ../DEPLOYMENT.md

Common Compose commands

```bash
# Dev
docker-compose up -d

docker-compose logs -f app

docker-compose down

# Fullstack
docker-compose -f docker-compose.fullstack.yml up -d
```

CI

- .github/workflows/ci.yml
  - Node job: npm ci (prod) + env validation
  - Docker job: build-only

Contributing

- Enable/define linting/tests in package.json and wire into scripts/test.sh
- Keep routes thin; use services for logic and controllers for orchestration
- Follow existing middleware patterns (requestId, errorHandler, csrfProtection)

License

ISC
