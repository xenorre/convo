# ConvoChat Backend

Production-ready Node.js/Express API with MongoDB and Socket.IO for real-time messaging. Includes CSRF protection, JWT auth (httpOnly cookie), CORS hardening, request tracing, Docker/Compose, optional Redis scaling, S3-compatible storage, and deployment scripts.

## Features

- Express 5 API with structured middleware and route modules
- Real-time messaging via Socket.IO (rooms: user:<id>)
- JWT auth in httpOnly cookie; protected routes middleware
- CSRF protection for unsafe methods (x-csrf-token + cookie)
- CORS with environment-based allowlists and strict security headers
- Request ID propagation and structured logging (winston + morgan)
- MongoDB (Mongoose) models for users and messages
- File uploads for messages/profile images (S3-compatible via AWS SDK)
- Optional Redis adapter for Socket.IO scaling and presence tracking
- Dockerfiles and Compose for dev, fullstack, and production
- CI workflow for Node and Docker builds

## Tech Stack

- Node 20, Express 5, Mongoose, Socket.IO
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
- Storage (S3-compatible)
  - STORAGE_URL, STORAGE_PUBLIC_URL, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, STORAGE_BUCKET_NAME
- Arcjet (optional)
  - ARCJET_KEY

The app performs environment validation at startup (zod). In production, CLIENT_URL is required.

## Scripts

package.json scripts (selected):

- npm run dev — node --watch src/index.js
- npm start — node src/index.js
- npm run docker:build / docker:run / docker:stop
- npm run compose:up|down|logs
- npm run fullstack:up|down|logs
- npm run production:up|down|logs
- npm run health — GET /healthz check

Helper scripts (scripts/):

- dev.sh — local or Docker dev; optional frontend start
- quickstart.sh — assisted setup
- test.sh — lint/tests/coverage/security (runs what’s available)
- deploy.sh — build/tag/push and local deploy via compose.production

Note: test/lint/type-check scripts in package.json are placeholders by default; wire your preferred tools to enable them (test.sh will call them if present).

## API Overview

Base URL: http://localhost:3000

Health and CSRF

- GET /healthz — liveness
- GET /readyz — readiness (Mongo connected)
- GET /csrf-token — returns { csrfToken }, used to set x-csrf-token header

Auth (/api/auth)

- POST /sign-up — { fullName, email, password }
- POST /login — { email, password }
- POST /logout — clears auth cookie
- GET /check — returns current user (requires auth)

Users (/api/users)

- GET /profile — current user
- PUT /update-profile — update profile fields
- PUT /update-profile-image — multipart/form-data field profileImage

Messages (/api/messages)

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

Minimal client connect example (fetch CSRF then send):

```js
// Pseudo-example
fetch('/csrf-token', { credentials: 'include' })
  .then(res => res.json())
  .then(({ csrfToken }) => fetch('/api/messages/send/<userId>', {
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
- docker-compose.production.yml — production-optimized with nginx, monitoring (profiles)

Common Compose commands

```bash
# Dev
docker-compose up -d

docker-compose logs -f app

docker-compose down

# Fullstack
docker-compose -f docker-compose.fullstack.yml up -d

# Production (core services)
docker-compose -f docker-compose.production.yml up -d
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
