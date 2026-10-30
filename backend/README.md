# Convo backend

The Express 5 and Socket.IO API behind Convo, on MongoDB. For the whole app
(features, frontend, releases) see the [root README](../README.md); for
production, [DEPLOYMENT.md](../DEPLOYMENT.md).

## Highlights

- REST API under `/api/v1`, real-time events over Socket.IO (one room per user)
- JWT in an httpOnly cookie, one active session per account, CSRF protection,
  strict CORS and Helmet headers
- Email confirmation, password reset and email change by one-time links (Resend)
- Passwords checked for strength (zxcvbn) and against known breaches
  (Have I Been Pwned, k-anonymity)
- Friends, blocking and per-user privacy settings enforced on every message
- Uploaded photos on the server's disk (or an S3-compatible bucket), at most 2 MB
- Data migrations that run by themselves on start
- Request IDs and structured logging (winston and morgan)
- Optional Redis adapter for several instances

## Quick start

```bash
cp .env.example .env    # set at least JWT_SECRET; DATABASE_URL defaults to a local MongoDB
npm ci
npm run dev             # http://localhost:3000, restarts on changes
```

Without `RESEND_API_KEY`, development logs each email (links included)
instead of sending it.

## Environment

Validated with zod at startup ([src/config/env.js](src/config/env.js));
[.env.example](.env.example) lists every variable.

- Server: `PORT` (3000), `NODE_ENV`, `LOG_LEVEL`, `LOG_TO_FILES`, `COOKIE_MAX_AGE_MS`
- Database and cache: `DATABASE_URL`, `REDIS_URL` (optional)
- Auth: `JWT_SECRET`, `JWT_EXPIRES_IN`
- Client: `CLIENT_URL` (one or comma-separated origins; required in production), `PREVIEW_URL`
- Email: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`
- Storage:
  - `STORAGE_DRIVER`: `local` (files on disk, served by the app under /uploads) or `s3`; empty means s3 when STORAGE_URL is set, local otherwise
  - `UPLOAD_DIR`: where `local` keeps files (default backend/uploads; a volume in Docker)
  - For `s3`: `STORAGE_URL`, `STORAGE_PUBLIC_URL`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET_NAME`
- Bot protection: `ARCJET_KEY` (optional)

## Scripts

- `npm run dev`: `node --watch src/index.js`; `npm start`: without watching
- `npm test`: unit tests, then integration tests
  - `npm run test:unit`: Node's built-in test runner with the database stubbed; no outside services
  - `npm run test:integration`: the real app over HTTP against a throwaway MongoDB (mongodb-memory-server, the same version as the Docker images); the first run downloads the MongoDB binary (about 70 MB) into ~/.cache
- `npm run migrate`: apply pending data migrations now (see below)
- `npm run health`: GET /healthz on the local server
- `npm run docker:build|docker:run|docker:stop`: this folder's image on its own

There is no backend linter yet; `npm run lint` is a placeholder.

## API

Every route is under `/api/v1`, needs the CSRF header for POST/PUT/PATCH/DELETE,
and, unless marked public, a signed-in session. Every answer carries
`X-App-Version` (and `X-App-Commit` in Docker builds).

Outside the API: `GET /healthz` (liveness and the running build:
`{ status, version, commit, builtAt }`), `GET /readyz` (MongoDB connected),
`GET /csrf-token` (`{ csrfToken }`), and `/uploads/...` (uploaded files).

| Area | Routes |
| --- | --- |
| Auth `/auth` | `POST /sign-up`, `/login`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password/check`, `/reset-password`, `/confirm-email-change` (all public); `POST /logout`; `GET /check`; `PUT /password` |
| Account `/users` | `GET /profile`; `PUT /update-profile`; `PUT /update-profile-image` (multipart `profileImage`); `DELETE /profile-image`; `GET /me/export`; `DELETE /me`; `GET`/`POST /me/email`; `DELETE /me/email/pending` |
| People `/users` | `GET /search?q=`; `GET`/`PATCH /settings` (privacy); `GET /blocked`; `POST`/`DELETE /:id/block`; `GET /:id/messaging` (may I message them?) |
| Friends `/friends` | `GET /`; `DELETE /:userId`; `GET`/`POST /requests`; `POST /requests/:id/accept`, `/requests/:id/decline`; `DELETE /requests/:id` |
| Messages `/messages` | `GET /chats`; `GET /:id?before=<cursor>` (a page of a conversation, newest first); `POST /send/:id` (JSON `{ text }` or multipart `messageFile` and `text`); `PATCH`/`DELETE /item/:id` (edit; delete `?for=me` or `everyone`); `POST /mark-read/:id`; `DELETE /chats/:id`; `PUT`/`DELETE /chats/:id/mute`, `/chats/:id/hide` |

### Socket.IO

The handshake reads the session cookie; each user joins the room `user:<id>`.

- Server → client: `newMessage`, `messages:read`, `message:hidden`, `typing`,
  `getOnlineUsers`, `chat:deleted`, `chat:hidden`, `chat:unhidden`,
  `chat:muted`, `chat:unmuted`, `friend:removed`, `friend:request:removed`,
  `account:deleted`, `account:email-changed`, `session:revoked`
- Client → server: `typing` (`{ to, isTyping }`, see [src/services/typing.service.js](src/services/typing.service.js))

## Data migrations

Data migrations live in `src/migrations/index.js` and run automatically: every
server start applies the ones this database has not seen, in the background
after the server starts listening, so no deploy platform needs an extra step.
The `migrations` collection records each one; with several instances only one
claims a migration and the others skip it. A failed migration is logged, the
app keeps running, and the next start retries it. Run `npm run migrate` to
apply them immediately (it exits non-zero if one fails).

- `2026-10-friends-from-chat-partners`: everyone who already exchanged a
  message becomes friends, so nobody loses their conversations when the
  friends list replaces the contacts list.
- `2026-10-confirm-existing-emails`: accounts from before email confirmation
  count as confirmed, so they keep signing in.

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

## Security

- CSRF: the `x-csrf-token` header must match the `csrfToken` cookie for POST/PUT/PATCH/DELETE
- CORS: a strict allowlist ([src/config/cors.config.js](src/config/cors.config.js)), several origins separated by commas
- Helmet: security headers including a Content-Security-Policy
- Auth: JWT in an httpOnly cookie; `protectRoute` checks the session and sets `req.user`
- Uploads: the stored name's extension comes from the checked type; files are served with a sandboxing CSP
- Bot protection: Arcjet rules when `ARCJET_KEY` is set
- Request tracing: the `x-request-id` header is echoed and logged

## Project structure

- `src/index.js`: loads the environment; `src/server.js`: connects to MongoDB, starts HTTP and Socket.IO, shuts down gracefully
- `src/app.js`: the Express app, middleware, routes, health checks
- `src/config`: environment, database, Socket.IO, CORS and headers, logging, storage, email, version
- `src/routes` → `src/controllers` → `src/services` → `src/models` (Mongoose)
- `src/middleware`: auth, CSRF, uploads, request IDs, errors
- `src/validations`: zod schemas for request bodies
- `src/migrations`: data migrations and their runner
- `src/utils`: cookies, tokens, email templates
- `test/`: unit tests; `test/integration/`: the app against a real MongoDB

## Docker

This folder's `Dockerfile` builds the API alone. Production uses the root
`Dockerfile` (API and built frontend in one image) and
`docker-compose.prod.yaml`; see [DEPLOYMENT.md](../DEPLOYMENT.md). For local
Docker setups see the [root README](../README.md).

## License

ISC
