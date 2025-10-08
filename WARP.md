# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Monorepo with two apps: backend (Node/Express API + Socket.IO + MongoDB) and frontend (React + Vite + TypeScript).
- Root package.json provides basic orchestration for installing/building and starting the backend.
- Local development defaults: frontend expects the API at http://localhost:3000 (see frontend/src/config/env.ts).

Requirements
- Node.js 20+ at the repo root; backend supports Node 18+ but root engines declare >=20.
- MongoDB connection URL for the backend.

Common commands
- Install dependencies
  - backend: npm install --prefix backend
  - frontend: npm install --prefix frontend

- Development
  - Backend (watch mode): npm run dev --prefix backend
  - Backend (normal): npm start --prefix backend
  - Frontend (dev server): npm run dev --prefix frontend
  - Frontend (preview production build): npm run preview --prefix frontend

- Build
  - Root (installs both, builds frontend): npm run build
  - Frontend: npm run build --prefix frontend

- Lint / format
  - Frontend lint: npm run lint --prefix frontend
  - Frontend fix: npm run lint:fix --prefix frontend
  - Prettier (frontend): npm run format --prefix frontend

- Type checking (frontend)
  - npm run type-check --prefix frontend

- Tests (frontend uses Vitest with jsdom; backend test scripts are placeholders)
  - Run all tests: npm test --prefix frontend
  - Watch mode: npm run test:watch --prefix frontend
  - Coverage: npm run test:coverage --prefix frontend
  - Run a single file: npm run test:run --prefix frontend -- src/path/to/Your.test.tsx

- Backend health check
  - npm run health --prefix backend

- Optional Docker/Compose helpers (backend package.json provides these; ensure related files exist before use)
  - Build image: npm run docker:build --prefix backend
  - Run container: npm run docker:run --prefix backend
  - Compose up (dev stack): npm run compose:up --prefix backend
  - Full stack (backend + frontend): npm run fullstack:up --prefix backend

Environment configuration
- Backend required variables (validated at startup in backend/src/config/env.js):
  - DATABASE_URL, JWT_SECRET
  - Optional: CLIENT_URL (required in production), REDIS_URL (enables Socket.IO scaling + presence), EMAIL/RESEND_* for email, STORAGE_* for S3-compatible uploads, LOG_*.
- Frontend variables (with sensible defaults in frontend/src/config/env.ts):
  - VITE_API_URL (default http://localhost:3000/api)
  - VITE_WS_URL (default http://localhost:3000)
  - Additional optional flags (e.g., VITE_SENTRY_DSN, VITE_APP_NAME, etc.).

High-level architecture
- Backend (backend/src)
  - Bootstrap
    - src/index.js loads dotenv and starts src/server.js
    - src/server.js validates env, connects MongoDB (backend/src/config/db.js), and starts the HTTP+Socket.IO server (backend/src/config/socket.js). Graceful shutdown on SIGINT/SIGTERM. Logging via Winston (backend/src/config/logger.js).
  - HTTP app composition (backend/src/app.js)
    - Express 5 app with JSON/urlencoded parsing, cookie-parser, Helmet (securityHeaders), CORS (corsConfig), requestId middleware, and Morgan logging enriched with requestId.
    - CSRF: ensureCsrfTokenCookie issues a csrfToken cookie on safe methods; csrfProtection validates x-csrf-token against the cookie for unsafe methods. Health: GET /healthz; Readiness: GET /readyz (Mongo connected).
    - Routes mounted under /api: /auth, /users, /messages. 404 handler and centralized error handler.
  - Socket.IO (backend/src/config/socket.js)
    - Creates an Express app and HTTP server shared with Socket.IO. CORS rules mirror HTTP allowlist. Optional Redis adapter enabled when REDIS_URL is set. Users join room user:<id>. Presence is tracked locally and, if Redis is configured, via sets: online_users and user_sockets:<userId>. Emits getOnlineUsers on connect/disconnect.
  - Key middleware
    - auth.middleware.js: reads httpOnly auth cookie, verifies JWT, populates req.user.
    - csrf.middleware.js: origin allowlist + token pairing enforcement.
    - upload/messageUpload middleware: validates and handles optional message file attachments.
  - Domain layers
    - Controllers route orchestration (auth, user, message).
    - Services encapsulate business and external integrations (auth, user, storage/uploads, email).
    - Models define Mongoose schemas (User, Message).
    - Utils: cookies/jwt helpers, formatting, email templates.
  - CORS and security
    - backend/src/config/cors.config.js builds environment-aware allowlists (dev regexes + CLIENT_URL/PREVIEW_URL), strict allowed/exposed headers, and Helmet contentSecurityPolicy tuned per NODE_ENV.

- Frontend (frontend/src)
  - Tooling & configuration
    - Vite + React SWC plugin; Tailwind via @tailwindcss/vite. Aliases defined in vite.config.ts and mirrored in tsconfig.app.json (e.g., @, @/components, @/pages, @/store, @/config).
    - Vitest configured with jsdom, test setup at src/test/setup.ts.
    - ESLint flat config (eslint.config.js) with typescript-eslint and React Hooks/Refresh plugins.
  - Application structure
    - Entry: src/main.tsx mounts App; global styles in src/index.css.
    - Layouts: RootLayout, AuthLayout, ChatsLayout compose the shell.
    - Pages: Login, SignUp, ChatPage.
    - State: Zustand stores (src/store/useAuthStore.ts, useChatStore.ts) hold auth/chat state.
    - Services: axios instance (src/config/axios.ts) bound to env.apiUrl with withCredentials and dev logging; additional service modules for API, logging, health monitoring.
    - Components: chat list, message input, headers, skeletons, protected route, etc.
    - Types: colocated type definitions (auth, message, chat, socket, api).
    - Utilities: sanitization, error handling, performance and UX hooks (debounce, reduced motion, connection status, etc.).

Conventions and interop
- Frontend defaults to backend at localhost:3000; set VITE_API_URL/VITE_WS_URL when backend runs elsewhere.
- Socket events
  - Server emits getOnlineUsers with user IDs and newMessage with { message } to room user:<id>.
- Path aliases
  - Backend uses import maps in package.json (e.g., #config/*, #routes/*). Frontend uses @/* aliases in Vite/TS config.

Notes for agents
- Backend test/lint scripts are placeholders; do not assume they run real checks unless you wire them up first.
- Docker/Compose scripts exist in backend package.json; they require matching Dockerfiles/compose files to be present in the working copy.
