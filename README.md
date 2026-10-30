# Convo

A real-time chat application monorepo.

- Backend: Node.js (Express 5), Socket.IO, MongoDB, JWT (httpOnly cookie), CSRF protection, CORS hardening, optional Redis adapter for scaling/presence, uploaded files on disk or in S3-compatible storage, optional Resend for email.
- Frontend: React + Vite + TypeScript, Zustand for state, Tailwind, Testing with Vitest + Testing Library.

## Requirements

- Node.js >= 24 (current LTS)
- MongoDB (local or remote)
- Redis (optional; enables Socket.IO scaling + presence)
- Docker & Docker Compose (optional, for containerized dev/prod)

## Quick Start

Choose one of the flows below.

### A) Local development

1) Backend

```bash
# From repo root
cp backend/.env.example backend/.env
# Edit backend/.env and set at least:
# DATABASE_URL=mongodb://localhost:27017/convo
# JWT_SECRET=change_me

npm install --prefix backend
npm run dev --prefix backend
# Backend on http://localhost:3000
```

2) Frontend

```bash
# In another terminal
npm install --prefix frontend
npm run dev --prefix frontend
# Frontend on http://localhost:5173
```

Frontend defaults to:
- API base: http://localhost:3000/api
- WebSocket origin: http://localhost:3000

To change, set VITE_API_URL and VITE_WS_URL (see frontend/.env.example).

### B) Docker (dev, hot-reload)

```bash
docker compose -f docker-compose.dev.yml up --build
# Frontend: http://localhost:5173
# Backend:  http://localhost:3000
```

Notes:
- CSRF and cookies work cross-origin in dev via backend CORS allowlist and frontend axios withCredentials.
- If port 5173 is taken, change the port mapping and set CLIENT_URL accordingly in backend env.

### C) Docker (single-host, same-origin)

This runs Nginx for the frontend and proxies /api and /socket.io to the backend, which simplifies CSRF and cookies (same-site).

```bash
export JWT_SECRET=your_secret
docker compose -f docker-compose.fullstack.yml up -d --build
# Open http://localhost:8080
```

### D) Kubernetes (example manifests)

```bash
# Ensure images are built/pushed to a registry reachable by your cluster
# Then apply manifests
kubectl apply -f deploy/k8s
# Set your real domain and TLS secret in deploy/k8s/ingress.yaml
```

- Frontend pods serve the SPA via Nginx and proxy to backend Service for /api and /socket.io (WebSockets enabled).
- Backend has liveness (/healthz) and readiness (/readyz) probes.

## Environment

Backend (validated at startup):
- Required: DATABASE_URL, JWT_SECRET
- Optional: CLIENT_URL (required in production), REDIS_URL, EMAIL_FROM/EMAIL_FROM_NAME, RESEND_API_KEY, STORAGE_DRIVER/UPLOAD_DIR/STORAGE_*, LOG_*
- See backend/.env.example and backend/src/config/env.js

Frontend (Vite variables):
- VITE_API_URL (default http://localhost:3000/api)
- VITE_WS_URL (default http://localhost:3000)
- See frontend/.env.example and frontend/src/config/env.ts

## Scripts & Commands

- Backend
  - Dev (watch): `npm run dev --prefix backend`
  - Start: `npm start --prefix backend`
  - Health check: `npm run health --prefix backend`
  - Docker helpers: `npm run docker:build|docker:run|compose:up --prefix backend` (ensure matching files exist)

- Frontend
  - Dev: `npm run dev --prefix frontend`
  - Build: `npm run build --prefix frontend`
  - Preview: `npm run preview --prefix frontend`
  - Lint: `npm run lint --prefix frontend`
  - Fix: `npm run lint:fix --prefix frontend`
  - Type-check: `npm run type-check --prefix frontend`
  - Backend tests: `npm test --prefix backend` (unit, then integration against a throwaway MongoDB)
  - Tests (Vitest):
    - All: `npm test --prefix frontend`
    - Watch: `npm run test:watch --prefix frontend`
    - Coverage: `npm run test:coverage --prefix frontend`
    - Single file: `npm run test:run --prefix frontend -- src/path/to/Your.test.tsx`

- Makefile (shortcuts)
  - `make dev` — dev stack (compose)
  - `make build-fullstack` / `make up-fullstack` / `make down-fullstack`
  - `make prod-up` / `make prod-down`
  - `make k8s-apply` / `make k8s-delete`

## Versions and releases

Convo has one version for the whole app (root, backend and frontend `package.json` move together) and a changelog generated from Conventional Commits.

- See what the next release would be, changing nothing: `npm run release:dry-run`
- First release (keeps 1.0.0, writes `CHANGELOG.md`, tags `v1.0.0`): `npm run release:first`
- Every release after that: `npm run release` (feat → minor, fix → patch, `feat!`/`BREAKING CHANGE` → major)
- Then publish the tag: `git push --follow-tags`

The API is versioned separately in its paths (`/api/v1/...`). A running server reports its build at `/healthz` and in the `X-App-Version` header; Settings › About shows both the app's and the server's version, and an open tab offers a reload when they differ.

## Measuring frontend performance

Run Lighthouse against the production build. The Vite development server on port 5173 includes development tooling and unminified modules, so its scores are not a production performance baseline.

With the local backend running on port 3000, build and preview the frontend:

```bash
VITE_API_URL=http://localhost:3000/api VITE_WS_URL=http://localhost:3000 npm run build --prefix frontend
npm run preview --prefix frontend -- --host localhost
```

Open `http://localhost:4173/login` and select Lighthouse's Desktop mode. Compare the same route and authentication state, keep the device settings fixed, and use the median of three runs. Compare FCP, LCP, TBT, CLS, and transferred JavaScript/CSS as well as the overall score.

Production telemetry is opt-in through `VITE_LOG_ENDPOINT`, `VITE_METRICS_ENDPOINT`, and `VITE_HEALTH_ENDPOINT`. Leave these unset unless the receiving endpoints exist; unconfigured telemetry does not generate background requests.

## Architecture (high-level)

- Backend (backend/src)
  - Entry: src/index.js (dotenv) -> src/server.js (env validation, MongoDB connect, start HTTP+Socket.IO, graceful shutdown)
  - HTTP app: src/app.js (Express 5, JSON/urlencoded, cookie-parser, Helmet security headers, CORS, requestId, Morgan)
    - CSRF: issues csrfToken cookie on safe methods; validates `x-csrf-token` on unsafe methods
    - Health: GET /healthz; Readiness: GET /readyz (Mongo connected)
    - Routes under /api: /auth, /users, /messages
  - WebSockets: src/config/socket.js (Socket.IO server with optional Redis adapter for scaling + presence)
    - Users join room `user:<id>`; broadcasts `getOnlineUsers`; emits `newMessage` to receiver room
  - Domain: controllers, services (auth/user/storage/email), models (User/Message), middleware (auth/csrf/upload/objectId), utils (cookies/jwt/format/email)

- Frontend (frontend/src)
  - Vite + React + TypeScript, Tailwind; path aliases via Vite/TS config
  - Entry: src/main.tsx -> App.tsx; global styles in src/index.css
  - State: Zustand stores (auth/chat)
  - Services: axios configured with env.apiUrl (withCredentials); logging & health
  - Components: chat list/container, headers, message input, protected route, skeletons
  - Tests: Vitest + jsdom; setup at src/test/setup.ts

## CSRF, Cookies, and WebSockets

- CSRF
  - Backend sets a readable csrfToken cookie on safe methods (GET/HEAD)
  - Client must echo it via `x-csrf-token` for unsafe methods (POST/PUT/PATCH/DELETE)
- Cookies/Auth
  - JWT in httpOnly cookie `token` (set by backend on sign-up/login)
  - In production, cookies use `SameSite=None; Secure`, so HTTPS is required
- WebSockets
  - Socket.IO CORS follows the same allowlist as HTTP; in single-host/Nginx modes it’s same-origin

## Monitoring (optional)

Optional monitoring stack via docker-compose.monitoring.yml (Prometheus, Grafana, Loki, Promtail, cAdvisor):

```bash
docker compose -f docker-compose.monitoring.yml up -d
# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3001
# Loki:       http://localhost:3100
# cAdvisor:   http://localhost:8085
```

You can wire application metrics later (e.g., prom-client) and add scrape configs.

## Troubleshooting

- Frontend dev container exits immediately:
  - We use Debian-based Node for frontend in docker-compose.dev.yml to avoid SWC musl issues on Alpine.
  - Ensure port 5173 is free, or change the port mapping and CLIENT_URL in backend env.
- Emails disabled locally:
  - If RESEND_API_KEY is not set, backend logs a warning and skips sending emails.

## Project Structure (top-level)

```
convo/
├── backend/       # Node/Express API + Socket.IO
├── frontend/      # React + Vite + TypeScript SPA
├── deploy/k8s/    # Example Kubernetes manifests
├── monitoring/    # Optional Prometheus/Grafana/Loki stack
├── docker-compose.*.yml
├── Makefile
└── WARP.md
```

## License

ISC
